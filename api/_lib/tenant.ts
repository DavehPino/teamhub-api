// Multi-tenant: qué organización atiende cada petición. La app móvil manda su slug en la cabecera x-org-slug; la web de
// Coyotes no manda nada y cae en la organización por defecto (DEFAULT_ORG_SLUG), así que su contrato no cambia.
// El resto del backend recibe el `Org` ya resuelto como primer parámetro: el compilador obliga a filtrar por él.
import { ORG_SLUG_HEADER } from '../../shared/domain.js'
import { env } from './env.js'
import { HttpError, notFound } from './http.js'
import { db } from './supabase.js'

export type Org = {
  id: string
  slug: string
  /** true si es la organización por defecto: usa las rutas del bucket y las palabras clave de siempre. */
  isDefault: boolean
}

/** Handler de una ruta agrupada que ya recibe la organización resuelta. */
export type OrgHandler = (request: Request, org: Org) => Promise<Response>

/** Mismo formato que el CHECK organizations_slug_format. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Las organizaciones casi no cambian: se recuerdan un minuto por instancia para no consultar en cada petición.
 * Limitación conocida: si se borra una organización (delete_organization) y se vuelve a crear otra con el MISMO slug,
 * las instancias que la tenían en caché siguen usando el id antiguo hasta 60 s (lecturas vacías, 403 o errores de FK,
 * nunca datos de otra organización). Esperar un minuto antes de reutilizar un slug borrado.
 */
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { org: Org; expires: number }>()

async function findOrg(slug: string): Promise<Org | null> {
  const hit = cache.get(slug)
  if (hit && hit.expires > Date.now()) return hit.org

  const { data, error } = await db().from('organizations').select('id,slug').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) return null

  const org: Org = { id: data.id, slug: data.slug, isDefault: data.slug === env.defaultOrgSlug }
  cache.set(slug, { org, expires: Date.now() + CACHE_TTL_MS })
  return org
}

/** Organización de la petición: la de la cabecera x-org-slug o, si falta, la de por defecto. 404 si no existe. */
export async function resolveOrg(request: Request): Promise<Org> {
  const header = request.headers.get(ORG_SLUG_HEADER)?.trim().toLowerCase()
  const slug = header || env.defaultOrgSlug
  if (!SLUG_FORMAT.test(slug)) throw new HttpError(400, 'bad_request', 'El identificador de organización no es válido')

  const org = await findOrg(slug)
  if (!org) {
    // Sin cabecera, la organización por defecto ausente es un error de configuración, no un 404 del cliente.
    if (!header) throw new Error(`La organización por defecto "${slug}" no existe en la tabla organizations`)
    throw notFound('La organización no existe')
  }
  return org
}

/** Todas las organizaciones (para los procesos que recorren a todas, como el cron de videos). */
export async function listOrgs(): Promise<Org[]> {
  const { data, error } = await db().from('organizations').select('id,slug').order('created_at', { ascending: true })
  if (error) throw error
  return data.map((row) => ({ id: row.id, slug: row.slug, isDefault: row.slug === env.defaultOrgSlug }))
}
