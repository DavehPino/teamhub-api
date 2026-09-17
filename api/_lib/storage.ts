// Acceso al bucket de videos vía API S3 (Cloudflare R2, AWS S3, MinIO, Backblaze B2...).
// Aquí se listan y borran los videos y se generan URLs de reproducción. Las subidas desde el
// dashboard viven en uploads.ts; también se pueden subir por fuera (consola de R2, rclone...).
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { MATCH_VIDEOS_FOLDER, VIDEO_FILE_EXTENSIONS } from '../../shared/domain.js'
import { env } from './env.js'
import { HttpError } from './http.js'

let client: S3Client | undefined

export function s3(): S3Client {
  const cfg = env.s3
  client ??= new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: !!cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // R2 y otros compatibles no soportan todos los checksums por defecto del SDK v3.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return client
}

/** Traduce los errores de permisos del bucket a un mensaje accionable. */
export async function storage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'AccessDenied' || name === 'Forbidden') {
      throw new HttpError(
        503,
        'storage_forbidden',
        'Las credenciales del bucket no permiten subir ni borrar archivos. El token de R2 necesita permiso de lectura y escritura.',
      )
    }
    throw err
  }
}

export type BucketVideo = {
  key: string
  size: number | null
  lastModified: string | null
  etag: string | null
}

export function isVideoKey(key: string): boolean {
  const lower = key.toLowerCase()
  return VIDEO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Lista todos los objetos de video bajo S3_VIDEO_PREFIX (maneja paginación). */
export async function listBucketVideos(): Promise<BucketVideo[]> {
  const { bucket, videoPrefix } = env.s3
  const videos: BucketVideo[] = []
  let token: string | undefined

  do {
    const page = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: videoPrefix || undefined,
        ContinuationToken: token,
      }),
    )
    for (const obj of page.Contents ?? []) {
      if (obj.Key && isVideoKey(obj.Key)) videos.push(toBucketVideo(obj))
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)

  return videos
}

export async function headVideo(key: string) {
  const res = await s3().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }))
  return { contentType: res.ContentType ?? null, size: res.ContentLength ?? null }
}

/** Borra un objeto del bucket. Si ya no existía no es un error. */
export async function deleteObject(key: string): Promise<void> {
  await storage(() => s3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key })))
}

/** Claves de todos los objetos bajo un prefijo (maneja paginación). */
export async function listObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const page = await storage(() =>
      s3().send(new ListObjectsV2Command({ Bucket: env.s3.bucket, Prefix: prefix, ContinuationToken: token })),
    )
    for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return keys
}

/** URL pública estable si el bucket es público; si no, null. */
export function publicUrlFor(key: string): string | null {
  const base = env.s3.publicBaseUrl
  if (!base) return null
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${base.replace(/\/+$/, '')}/${path}`
}

/** URL para reproducir: pública si existe; si no, firmada y temporal. */
export async function playbackUrlFor(key: string): Promise<{ url: string; expiresAt: string | null }> {
  const publicUrl = publicUrlFor(key)
  if (publicUrl) return { url: publicUrl, expiresAt: null }

  const ttl = env.s3.signedUrlTtlSeconds
  const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
    expiresIn: ttl,
  })
  return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }
}

/** Título legible a partir de la clave: "games/2026-09-06-vs-onas/set-1.mp4" → "set 1". */
export function titleFromKey(key: string): string {
  const file = key.split('/').pop() ?? key
  return file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || file
}

/** Carpeta de un partido dentro del bucket: "<prefijo>games/<slug>/". */
export function matchFolderKey(slug: string): string {
  return `${env.s3.videoPrefix}${MATCH_VIDEOS_FOLDER}/${slug}/`
}

/**
 * Slug del partido según la carpeta: "<prefijo>games/2026-09-06-vs-onas/set-1.mp4" → "2026-09-06-vs-onas".
 * Devuelve null si el video no está dentro de una carpeta de partido.
 */
export function matchSlugFromKey(key: string): string | null {
  const relative = key.slice(env.s3.videoPrefix.length)
  const [folder, slug, ...rest] = relative.split('/')
  return folder === MATCH_VIDEOS_FOLDER && slug && rest.length > 0 ? slug : null
}

function toBucketVideo(obj: _Object): BucketVideo {
  return {
    key: obj.Key!,
    size: obj.Size ?? null,
    lastModified: obj.LastModified?.toISOString() ?? null,
    etag: obj.ETag?.replaceAll('"', '') ?? null,
  }
}
