// Subida de videos desde el dashboard con subida multiparte de S3 (R2 la soporta).
// El archivo NUNCA pasa por Vercel (límite de 4,5 MB por petición): la API crea la subida,
// firma una URL por trozo y el navegador envía cada trozo directo al bucket.
// Requisitos del bucket: credenciales con escritura y CORS que permita PUT y exponga ETag.
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListObjectsV2Command,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { slugify } from '../../shared/matches.js'
import type {
  UploadAbortInput,
  UploadCompleteInput,
  UploadStart,
  UploadStartInput,
  Video,
} from '../../shared/schemas.js'
import { env } from './env.js'
import { badRequest, conflict, notFound } from './http.js'
import { toVideo } from './mappers.js'
import { getMatchRef, type MatchRef } from './matches.js'
import { headVideo, isVideoKey, matchFolderKey, publicUrlFor, s3, storage } from './storage.js'
import { db } from './supabase.js'

/** 25 MiB por trozo: pocos reintentos caros en redes móviles y muy por debajo de 10.000 trozos. */
const PART_SIZE = 25 * 1024 * 1024
/** Las URLs de los trozos duran lo suficiente para subir varios GB con una conexión lenta. */
const PART_URL_TTL_SECONDS = 6 * 60 * 60
const MAX_NAME_ATTEMPTS = 100

async function requireMatch(matchId: string): Promise<MatchRef> {
  const match = await getMatchRef(matchId)
  if (!match) throw notFound('Partido no encontrado')
  return match
}

/** La clave tiene que estar dentro de la carpeta del partido: impide escribir en otras rutas. */
function assertKeyInMatch(key: string, match: MatchRef): void {
  const folder = matchFolderKey(match.slug)
  const file = key.slice(folder.length)
  if (!key.startsWith(folder) || !file || file.includes('/') || !isVideoKey(file)) {
    throw badRequest('El archivo no pertenece a este partido')
  }
}

/** "Set 1 FINAL.MOV" → { stem: "set-1-final", ext: ".mov" } */
function splitFileName(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : ''
  const stem = slugify(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 80).replace(/-+$/, '')
  return { stem: stem || 'video', ext }
}

/** Primera clave libre en la carpeta del partido: set-1.mp4, set-1-2.mp4... */
async function freeKey(match: MatchRef, fileName: string): Promise<string> {
  const folder = matchFolderKey(match.slug)
  const { stem, ext } = splitFileName(fileName)

  const [objects, rows] = await Promise.all([
    storage(() => s3().send(new ListObjectsV2Command({ Bucket: env.s3.bucket, Prefix: folder }))),
    db().from('videos').select('storage_key').like('storage_key', `${folder}%`),
  ])
  if (rows.error) throw rows.error
  const taken = new Set([
    ...(objects.Contents ?? []).flatMap((obj) => (obj.Key ? [obj.Key] : [])),
    ...rows.data.flatMap((row) => (row.storage_key ? [row.storage_key] : [])),
  ])

  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n += 1) {
    const key = `${folder}${n === 1 ? stem : `${stem}-${n}`}${ext}`
    if (!taken.has(key)) return key
  }
  throw conflict('Hay demasiados archivos con ese nombre en el partido. Renombra el video.')
}

export async function startVideoUpload(input: UploadStartInput): Promise<UploadStart> {
  if (!isVideoKey(input.file_name)) {
    throw badRequest('Formato no admitido. Usa MP4, MOV, M4V, WEBM o MKV.')
  }
  const match = await requireMatch(input.match_id)
  const key = await freeKey(match, input.file_name)
  const bucket = env.s3.bucket

  const created = await storage(() =>
    s3().send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: input.content_type || undefined }),
    ),
  )
  const uploadId = created.UploadId
  if (!uploadId) throw new Error('El bucket no devolvió un identificador de subida')

  const partCount = Math.ceil(input.size_bytes / PART_SIZE)
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, index) => {
      const partNumber = index + 1
      const url = await getSignedUrl(
        s3(),
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: PART_URL_TTL_SECONDS },
      )
      return { part_number: partNumber, url }
    }),
  )

  return {
    key,
    upload_id: uploadId,
    part_size: PART_SIZE,
    parts,
    expires_at: new Date(Date.now() + PART_URL_TTL_SECONDS * 1000).toISOString(),
  }
}

/** Cierra la subida multiparte y registra el video, ya vinculado al partido. */
export async function completeVideoUpload(input: UploadCompleteInput): Promise<Video> {
  const match = await requireMatch(input.match_id)
  assertKeyInMatch(input.key, match)
  const bucket = env.s3.bucket

  const parts = [...input.parts].sort((a, b) => a.part_number - b.part_number)
  await storage(() =>
    s3().send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: input.key,
        UploadId: input.upload_id,
        MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.part_number, ETag: part.etag })) },
      }),
    ),
  )
  const head = await storage(() => headVideo(input.key))

  // upsert por si el cron de sincronización ya registró el archivo entre medias.
  const { data, error } = await db()
    .from('videos')
    .upsert(
      {
        source: 'bucket',
        storage_key: input.key,
        url: publicUrlFor(input.key),
        title: input.title,
        content_type: head.contentType,
        size_bytes: head.size,
        category: 'partido',
        status: 'ready',
        match_id: match.id,
        set_number: input.set_number,
        sort_order: input.sort_order,
        recorded_on: match.played_on,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'storage_key' },
    )
    .select('*')
    .single()
  if (error) throw error
  return toVideo(data)
}

/** Descarta los trozos ya subidos de una subida cancelada o fallida. */
export async function abortVideoUpload(input: UploadAbortInput): Promise<void> {
  const match = await requireMatch(input.match_id)
  assertKeyInMatch(input.key, match)
  try {
    await storage(() =>
      s3().send(new AbortMultipartUploadCommand({ Bucket: env.s3.bucket, Key: input.key, UploadId: input.upload_id })),
    )
  } catch (err) {
    // Ya cerrada o caducada: no queda nada que limpiar.
    if (err instanceof Error && err.name === 'NoSuchUpload') return
    throw err
  }
}
