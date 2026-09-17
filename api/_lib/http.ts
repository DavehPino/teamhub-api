// Utilidades HTTP para Vercel Functions con la firma Web estándar (Request → Response).
import type { z } from 'zod'
import type { ApiErrorBody } from '../../shared/schemas.js'
import { env } from './env.js'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details)
export const unauthorized = (message = 'No autorizado') => new HttpError(401, 'unauthorized', message)
export const notFound = (message = 'No encontrado') => new HttpError(404, 'not_found', message)
export const conflict = (message: string) => new HttpError(409, 'conflict', message)

/** Lecturas del dashboard: cacheables en el navegador durante un minuto. */
export const CACHE_PRIVATE = 'private, max-age=60'
/** URLs firmadas y crons: nunca se cachean. */
export const NO_STORE = 'no-store'

export function json<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json(data, init)
}

export function cached<T>(data: T, cacheControl: string = CACHE_PRIVATE): Response {
  return json(data, { headers: { 'Cache-Control': cacheControl } })
}

export function noStore<T>(data: T, status = 200): Response {
  return json(data, { status, headers: { 'Cache-Control': NO_STORE } })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } }
    return json(body, { status: err.status, headers: { 'Cache-Control': NO_STORE } })
  }
  console.error(err)
  const body: ApiErrorBody = { error: { code: 'internal_error', message: 'Error interno del servidor' } }
  return json(body, { status: 500, headers: { 'Cache-Control': NO_STORE } })
}

export type Handler = (request: Request) => Promise<Response>

/** Envuelve un handler para convertir cualquier excepción en una respuesta JSON coherente. */
export function handle(handler: Handler): Handler {
  return async (request) => {
    try {
      return await handler(request)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw badRequest('El cuerpo debe ser JSON válido')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw badRequest('Datos inválidos', result.error.issues)
  return result.data
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const result = schema.safeParse(params)
  if (!result.success) throw badRequest('Parámetros inválidos', result.error.issues)
  return result.data
}

/** Último segmento de la ruta, p.ej. /api/videos/<id> → <id>. `fromEnd` cuenta hacia atrás. */
export function pathParam(request: Request, fromEnd = 0): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const value = segments[segments.length - 1 - fromEnd]
  if (!value) throw badRequest('Falta un parámetro en la ruta')
  return decodeURIComponent(value)
}

/**
 * Handler de un segmento de ruta dentro de una función que agrupa varias rutas (p.ej. /api/admin/:action).
 * 404 si el segmento no está en la tabla.
 */
export function routeFor<T>(routes: Record<string, T>, key: string): T {
  if (!Object.hasOwn(routes, key)) throw notFound()
  return routes[key]
}

/**
 * Crons de Vercel: la plataforma envía `Authorization: Bearer <CRON_SECRET>`.
 * Sin secreto configurado el endpoint queda cerrado.
 */
export function requireCronSecret(request: Request): void {
  const secret = env.cronSecret
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw unauthorized()
}
