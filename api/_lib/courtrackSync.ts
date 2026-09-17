// Proxy al microservicio courtrack-service (repo aparte, mismo Supabase): el navegador solo habla con /api y el
// token del servicio nunca sale del servidor. Los errores del servicio se reenvían con su mismo código y mensaje.
// Todas las llamadas llevan la organización de este deploy (ORG_ID).
import type {
  ApiErrorBody,
  CourtrackCatalogInput,
  CourtrackCliente,
  CourtrackDiscoveredLiga,
  CourtrackEquipo,
  CourtrackLiga,
  CourtrackPartido,
  CourtrackSyncAllResult,
  CourtrackSyncResult,
  CourtrackSyncStatus,
} from '../../shared/schemas.js'
import { env } from './env.js'
import { HttpError } from './http.js'
import { getOwnTeam } from './teams.js'

/** Margen por debajo del maxDuration de api/admin/[action].ts (60 s). */
const TIMEOUT_MS = 55_000

type Call = { method: 'GET' | 'POST'; path: string; query?: Record<string, string>; body?: unknown }

async function callSyncService<T>({ method, path, query, body }: Call): Promise<T> {
  const { url, secret } = env.courtrackSync
  if (!url || !secret) {
    throw new HttpError(
      503,
      'sync_disabled',
      'La sincronización con CourtTrack no está configurada en el servidor (faltan COURTRACK_SYNC_URL y COURTRACK_SYNC_SECRET).',
    )
  }

  const target = new URL(`${url}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) target.searchParams.set(key, value)

  let res: Response
  try {
    res = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    console.error(err)
    throw new HttpError(502, 'sync_unavailable', 'No se pudo contactar con el servicio de sincronización.')
  }

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error
    throw new HttpError(
      res.status,
      error?.code ?? 'sync_error',
      error?.message ?? `El servicio de sincronización respondió ${res.status}`,
      error?.details,
    )
  }
  if (data === null) throw new HttpError(502, 'sync_error', 'El servicio de sincronización no devolvió datos válidos.')
  return data as T
}

/** Cupo restante, ligas configuradas y últimas sincronizaciones de la organización. */
export const getCourtrackSyncStatus = () =>
  callSyncService<CourtrackSyncStatus>({ method: 'GET', path: '/api/sync', query: { org_id: env.orgId } })

/** Sincroniza una temporada (`leagueId`) o todas las ligas activas (`null`), o lo simula con `dry_run`. */
export const runCourtrackSync = (leagueId: string | null, dryRun: boolean) =>
  callSyncService<CourtrackSyncResult | CourtrackSyncAllResult>({
    method: 'POST',
    path: '/api/sync',
    body: { org_id: env.orgId, ...(leagueId ? { league_id: leagueId } : {}), dry_run: dryRun },
  })

/**
 * Catálogo de CourtTrack para el asistente "Agregar liga". En `descubrir`, el equipo buscado es siempre el propio de
 * la organización (teams.is_own_team): el cliente no puede buscar otro nombre.
 */
export async function getCourtrackCatalog(input: CourtrackCatalogInput) {
  const query: Record<string, string> = {}
  if ('id_cliente' in input) query.id_cliente = String(input.id_cliente)
  if ('liga_id' in input) query.liga_id = String(input.liga_id)
  if (input.resource === 'descubrir') query.team = (await getOwnTeam()).name
  return callSyncService<CourtrackCliente[] | CourtrackLiga[] | CourtrackEquipo[] | CourtrackDiscoveredLiga[]>({
    method: 'GET',
    path: `/api/courtrack/${input.resource}`,
    query,
  })
}

export const getCourtrackLigas = (idCliente: number) =>
  callSyncService<CourtrackLiga[]>({ method: 'GET', path: '/api/courtrack/ligas', query: { id_cliente: String(idCliente) } })

/** Progresión, estadísticas y formaciones de un partido de CourtTrack (`matches.courtrack_id`). */
export const getCourtrackPartido = (courtrackId: number) =>
  callSyncService<CourtrackPartido>({ method: 'GET', path: '/api/courtrack/partido', query: { id: String(courtrackId) } })

export const getCourtrackEquipos = (idCliente: number, ligaId: number) =>
  callSyncService<CourtrackEquipo[]>({
    method: 'GET',
    path: '/api/courtrack/equipos',
    query: { id_cliente: String(idCliente), liga_id: String(ligaId) },
  })
