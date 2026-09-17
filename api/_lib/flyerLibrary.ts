// Biblioteca de la sección Flyers en el bucket, carpeta assets/ (fuera de la de videos: el cron solo registra
// extensiones de video, así que no las toca). Nada va a la base de datos: cada elemento es su archivo más un JSON.
//   assets/images/<id>.webp|png  + assets/images/<id>.json  → { id, name, contentType, createdAt }
//   assets/flyers/<id>.png       + assets/flyers/<id>.json  → { id, savedAt, source, label, flyer }
// Los archivos los sube el navegador directo al bucket con una URL firmada (Vercel limita el cuerpo a 4,5 MB);
// la API solo firma, comprueba que el archivo llegó y escribe el JSON.
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  FLYER_ASSET_NAME_MAX,
  FLYER_IMAGE_MAX_BYTES,
  FLYER_IMAGE_TYPES,
  FLYER_MAX_ASSETS,
  FLYER_PNG_MAX_BYTES,
  SAVED_FLYER_LABEL_MAX,
  SAVED_FLYERS_LIMIT,
  flyerContentSchema,
  type FlyerImage,
  type FlyerImageDeleteInput,
  type FlyerImageRenameInput,
  type FlyerImageSaveInput,
  type FlyerLibrary,
  type FlyerUploadUrl,
  type FlyerUploadUrlInput,
  type SavedFlyer,
  type SavedFlyerDeleteInput,
  type SavedFlyerSaveInput,
} from '../../shared/flyers.js'
import { env } from './env.js'
import { badRequest, conflict, notFound } from './http.js'
import { deleteObject, listObjectKeys, publicUrlFor, s3, storage } from './storage.js'

const ASSETS_FOLDER = 'assets'
const IMAGES = `${ASSETS_FOLDER}/images/`
const FLYERS = `${ASSETS_FOLDER}/flyers/`

const EXTENSIONS: Record<string, string> = { 'image/webp': '.webp', 'image/png': '.png' }
/** Tiempo para completar la subida tras pedir la URL. */
const UPLOAD_URL_TTL_SECONDS = 10 * 60

const imageMeta = z.object({
  id: z.string(),
  name: z.string().max(FLYER_ASSET_NAME_MAX),
  contentType: z.enum(FLYER_IMAGE_TYPES),
  createdAt: z.string(),
})
type ImageMeta = z.infer<typeof imageMeta>

const flyerMeta = z.object({
  id: z.string(),
  savedAt: z.string(),
  source: z.enum(['ia', 'manual']),
  label: z.string().max(SAVED_FLYER_LABEL_MAX),
  flyer: flyerContentSchema,
})
type FlyerMeta = z.infer<typeof flyerMeta>

const imageFile = (meta: Pick<ImageMeta, 'id' | 'contentType'>) => `${IMAGES}${meta.id}${EXTENSIONS[meta.contentType]}`
const flyerFile = (id: string) => `${FLYERS}${id}.png`
const metaKey = (folder: string, id: string) => `${folder}${id}.json`

const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`

/**
 * URL de lectura: la pública si el bucket la tiene; si no, firmada. La firma se fecha al inicio de la hora y dura
 * dos: durante esa hora la URL no cambia y el navegador puede cachear la imagen entre visitas.
 */
async function readUrl(key: string): Promise<string> {
  const publicUrl = publicUrlFor(key)
  if (publicUrl) return publicUrl
  const hour = 3_600_000
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
    signingDate: new Date(Math.floor(Date.now() / hour) * hour),
    expiresIn: 2 * 3600,
  })
}

async function readJson<S extends z.ZodType>(key: string, schema: S): Promise<z.infer<S> | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }))
    const parsed = schema.safeParse(JSON.parse((await res.Body?.transformToString('utf-8')) ?? ''))
    return parsed.success ? parsed.data : null
  } catch (err) {
    // Borrado entre el listado y la lectura, o JSON dañado: se omite sin romper la biblioteca.
    if (err instanceof Error && (err.name === 'NoSuchKey' || err instanceof SyntaxError)) return null
    throw err
  }
}

async function writeJson(key: string, data: unknown): Promise<void> {
  await storage(() =>
    s3().send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
      }),
    ),
  )
}

/** Tamaño del archivo subido, o null si no está. */
async function sizeOf(key: string): Promise<number | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }))
    return head.ContentLength ?? 0
  } catch (err) {
    if (err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey')) return null
    throw err
  }
}

const metaIds = async (folder: string) =>
  (await listObjectKeys(folder)).filter((key) => key.endsWith('.json')).map((key) => key.slice(folder.length, -5))

async function readImage(id: string): Promise<ImageMeta | null> {
  return readJson(metaKey(IMAGES, id), imageMeta)
}

async function toImage(meta: ImageMeta): Promise<FlyerImage> {
  return { id: meta.id, name: meta.name, createdAt: meta.createdAt, url: await readUrl(imageFile(meta)) }
}

async function toSavedFlyer(meta: FlyerMeta): Promise<SavedFlyer> {
  return { ...meta, imageUrl: await readUrl(flyerFile(meta.id)) }
}

export async function getFlyerLibrary(): Promise<FlyerLibrary> {
  const [imageIds, flyerIds] = await Promise.all([metaIds(IMAGES), metaIds(FLYERS)])
  const [images, flyers] = await Promise.all([
    Promise.all(imageIds.map((id) => readImage(id))),
    Promise.all(flyerIds.map((id) => readJson(metaKey(FLYERS, id), flyerMeta))),
  ])
  return {
    images: await Promise.all(
      images
        .filter((meta): meta is ImageMeta => meta !== null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toImage),
    ),
    flyers: await Promise.all(
      flyers
        .filter((meta): meta is FlyerMeta => meta !== null)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map(toSavedFlyer),
    ),
  }
}

/** Firma la subida de un archivo nuevo. El id lo pone el servidor: el navegador no elige dónde escribe. */
export async function createUploadUrl(input: FlyerUploadUrlInput): Promise<FlyerUploadUrl> {
  const id = newId(input.kind === 'image' ? 'asset' : 'flyer')
  const key = input.kind === 'image' ? imageFile({ id, contentType: input.contentType }) : flyerFile(id)
  const url = await storage(() =>
    getSignedUrl(s3(), new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, ContentType: input.contentType }), {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    }),
  )
  return { id, url, headers: { 'Content-Type': input.contentType } }
}

/** Comprueba que el archivo llegó y no se pasa de tamaño; si se pasa, lo borra. */
async function assertUploaded(key: string, maxBytes: number, what: string): Promise<void> {
  const size = await storage(() => sizeOf(key))
  if (size === null) throw badRequest(`${what} no llegó al bucket. Vuelve a intentarlo.`)
  if (size > maxBytes) {
    await deleteObject(key)
    throw badRequest(`${what} pesa demasiado (máximo ${Math.round(maxBytes / 1024 / 1024)} MB).`)
  }
}

export async function saveImage(input: FlyerImageSaveInput): Promise<FlyerImage> {
  const file = imageFile(input)
  if ((await metaIds(IMAGES)).length >= FLYER_MAX_ASSETS) {
    await deleteObject(file)
    throw conflict(`Ya hay ${FLYER_MAX_ASSETS} imágenes. Borra alguna para subir otra.`)
  }
  await assertUploaded(file, FLYER_IMAGE_MAX_BYTES, 'La imagen')
  const meta: ImageMeta = { id: input.id, name: input.name, contentType: input.contentType, createdAt: new Date().toISOString() }
  await writeJson(metaKey(IMAGES, input.id), meta)
  return toImage(meta)
}

export async function renameImage(input: FlyerImageRenameInput): Promise<FlyerImage> {
  const meta = await readImage(input.id)
  if (!meta) throw notFound('Imagen no encontrada')
  const next = { ...meta, name: input.name }
  await writeJson(metaKey(IMAGES, input.id), next)
  return toImage(next)
}

export async function deleteImage(input: FlyerImageDeleteInput): Promise<void> {
  const meta = await readImage(input.id)
  // Primero el JSON: la imagen desaparece de la biblioteca aunque falle el borrado del archivo.
  await deleteObject(metaKey(IMAGES, input.id))
  if (meta) await deleteObject(imageFile(meta))
}

export async function saveFlyer(input: SavedFlyerSaveInput): Promise<SavedFlyer> {
  const file = flyerFile(input.id)
  if ((await metaIds(FLYERS)).length >= SAVED_FLYERS_LIMIT) {
    await deleteObject(file)
    throw conflict(`Ya hay ${SAVED_FLYERS_LIMIT} flyers guardados. Borra alguno para guardar otro.`)
  }
  await assertUploaded(file, FLYER_PNG_MAX_BYTES, 'El flyer')
  const meta: FlyerMeta = { ...input, savedAt: new Date().toISOString() }
  await writeJson(metaKey(FLYERS, input.id), meta)
  return toSavedFlyer(meta)
}

export async function deleteFlyer(input: SavedFlyerDeleteInput): Promise<void> {
  await deleteObject(metaKey(FLYERS, input.id))
  await deleteObject(flyerFile(input.id))
}
