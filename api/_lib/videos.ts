// Acceso a datos de videos, edición desde el dashboard y sincronización con el bucket.
import type { Playback, SyncResult, Video, VideoDeleteInput, VideoUpdateInput } from '../../shared/schemas.js'
import { notFound } from './http.js'
import { toVideo } from './mappers.js'
import {
  deleteObject,
  listBucketVideos,
  matchSlugFromKey,
  playbackUrlFor,
  publicUrlFor,
  titleFromKey,
} from './storage.js'
import { db, type Tables } from './supabase.js'

type VideoInsert = Tables['videos']['Insert']

export async function getVideoById(id: string): Promise<Video | null> {
  const { data, error } = await db().from('videos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toVideo(data) : null
}

/** Cambia el título y el set de un video. */
export async function updateVideo(input: VideoUpdateInput): Promise<Video> {
  const { data, error } = await db()
    .from('videos')
    .update({ title: input.title, set_number: input.set_number })
    .eq('id', input.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Video no encontrado')
  return toVideo(data)
}

/**
 * Borra un video: primero el archivo del bucket y después la fila. En ese orden, si el bucket falla la fila sigue
 * ahí; al revés, la sincronización volvería a crear la fila a partir del archivo que quedó.
 */
export async function deleteVideo(input: VideoDeleteInput): Promise<void> {
  const video = await getVideoById(input.id)
  if (!video) throw notFound('Video no encontrado')
  if (video.source === 'bucket' && video.storage_key) await deleteObject(video.storage_key)

  const { error } = await db().from('videos').delete().eq('id', video.id)
  if (error) throw error
}

/** URL de reproducción: la del enlace externo, la pública del bucket o una firmada temporal. */
export async function playbackFor(video: Video): Promise<Playback> {
  if (video.source === 'external') {
    if (!video.url) throw new Error(`El video externo ${video.id} no tiene URL`)
    return { url: video.url, expiresAt: null }
  }
  if (!video.storage_key) throw new Error(`El video ${video.id} no tiene clave en el bucket`)
  return playbackUrlFor(video.storage_key)
}

/** "games/<slug>/set-2-final.mp4" → 2. Solo cuenta el nombre de archivo. */
export function setNumberFromKey(key: string): number | null {
  const file = key.split('/').pop() ?? ''
  const match = /^set[-_ ]?(\d)(?!\d)/i.exec(file)
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 && n <= 5 ? n : null
}

const BATCH_SIZE = 200

/**
 * Sincroniza la tabla `videos` con los objetos del bucket. Idempotente:
 * - clave nueva → fila `pending` (o `ready` y vinculada si está en games/<slug>/)
 * - clave existente → refresca tamaño, URL y last_synced_at, y vincula si aún no tiene partido
 * - clave desaparecida → se cuenta, no se borra
 * Nunca pisa metadata editada a mano (título, categoría, estado, set...).
 */
export async function syncBucketVideos(): Promise<SyncResult> {
  const objects = await listBucketVideos()
  const now = new Date().toISOString()

  const [{ data: matchRows, error: matchesError }, { data: existingRows, error: videosError }] = await Promise.all([
    db().from('matches').select('id,slug,played_on'),
    db()
      .from('videos')
      .select('id,storage_key,title,category,status,match_id,set_number,recorded_on,content_type')
      .eq('source', 'bucket'),
  ])
  if (matchesError) throw matchesError
  if (videosError) throw videosError

  const matchesBySlug = new Map(matchRows.map((m) => [m.slug, m]))
  const existingByKey = new Map(existingRows.flatMap((v) => (v.storage_key ? [[v.storage_key, v] as const] : [])))
  const bucketKeys = new Set(objects.map((o) => o.key))

  const result: SyncResult = {
    scanned: objects.length,
    created: 0,
    updated: 0,
    linked_to_match: 0,
    missing_in_bucket: 0,
  }
  const rows: VideoInsert[] = []

  for (const obj of objects) {
    const slug = matchSlugFromKey(obj.key)
    const match = slug ? matchesBySlug.get(slug) : undefined
    const existing = existingByKey.get(obj.key)

    if (!existing) {
      const row: VideoInsert = {
        source: 'bucket',
        storage_key: obj.key,
        title: titleFromKey(obj.key),
        size_bytes: obj.size,
        url: publicUrlFor(obj.key),
        status: 'pending',
        category: 'sin_clasificar',
        match_id: null,
        set_number: setNumberFromKey(obj.key),
        recorded_on: null,
        content_type: null,
        last_synced_at: now,
      }
      if (match) {
        row.match_id = match.id
        row.category = 'partido'
        row.status = 'ready'
        row.recorded_on = match.played_on
        result.linked_to_match += 1
      }
      rows.push(row)
      result.created += 1
      continue
    }

    // Fila existente: solo se refrescan los datos que vienen del bucket.
    const row: VideoInsert = {
      source: 'bucket',
      storage_key: obj.key,
      title: existing.title,
      size_bytes: obj.size,
      url: publicUrlFor(obj.key),
      status: existing.status,
      category: existing.category,
      match_id: existing.match_id,
      set_number: existing.set_number,
      recorded_on: existing.recorded_on,
      content_type: existing.content_type,
      last_synced_at: now,
    }
    if (!existing.match_id && match) {
      row.match_id = match.id
      if (existing.category === 'sin_clasificar') row.category = 'partido'
      if (existing.status === 'pending') row.status = 'ready'
      if (!existing.recorded_on) row.recorded_on = match.played_on
      if (existing.set_number === null) row.set_number = setNumberFromKey(obj.key)
      result.linked_to_match += 1
    }
    rows.push(row)
    result.updated += 1
  }

  for (const key of existingByKey.keys()) {
    if (!bucketKeys.has(key)) result.missing_in_bucket += 1
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await db()
      .from('videos')
      .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'storage_key' })
    if (error) throw error
  }

  return result
}
