// Quién puede escribir en una organización. Dos vías, independientes:
// - Sesión de Supabase Auth (cabecera `Authorization: Bearer <jwt>`): la usará la app móvil. El usuario tiene que ser
//   miembro de la organización de la petición (tabla org_members).
// - Palabras clave compartidas (la web de Coyotes; no es un sistema de usuarios): evitan que cualquiera con la URL del
//   dashboard cree datos o gaste recursos. Solo abren la organización por defecto, nunca otra.
//   Hay dos, independientes, para poder dar acceso a una parte y no a la otra:
//   - ADMIN_SAFEWORD (cabecera x-admin-safeword): actividades, partidos y videos.
//   - FLYERS_SAFEWORD (cabecera x-flyers-safeword): imágenes y flyers del bucket y el asistente de IA.
// Los invitados (solo lectura) no pasan por aquí: los GET públicos no exigen nada.
import { createHash, timingSafeEqual } from 'node:crypto'
import { ADMIN_SAFEWORD_HEADER, FLYERS_SAFEWORD_HEADER } from '../../shared/domain.js'
import { env } from './env.js'
import { HttpError, forbidden, unauthorized } from './http.js'
import { db } from './supabase.js'
import type { Org } from './tenant.js'

/** Pausa ante un intento fallido: encarece probar palabras a ciegas. */
const FAILURE_DELAY_MS = 700

export type MemberRole = 'admin' | 'coach'

/** Quién autorizó la petición. */
export type Actor = { kind: 'safeword' } | { kind: 'user'; userId: string; role: MemberRole }

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()

/** Pausa ante un intento fallido (contraseña, sesión o código de invitación): encarece probar a ciegas. */
export const delayFailure = () => new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))

function safewordFrom(request: Request, header: string): string {
  const raw = request.headers.get(header) ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return ''
  }
}

function bearerFrom(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  return match ? match[1] : null
}

/** Usuario de Supabase Auth dueño del token, o 401. Supabase valida la firma y la caducidad. */
export async function userIdFromToken(token: string): Promise<string> {
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) {
    await delayFailure()
    throw unauthorized('Sesión no válida o caducada')
  }
  return data.user.id
}

/** Usuario autenticado con sesión de Supabase (sin organización): 401 si no hay token o no vale. */
export async function requireUser(request: Request): Promise<string> {
  const token = bearerFrom(request)
  if (!token) throw unauthorized('Inicia sesión para continuar')
  return userIdFromToken(token)
}

/**
 * Solo administradores del club con sesión: gestionar miembros e invitaciones. Las palabras clave compartidas no valen
 * (no identifican a nadie) y un entrenador (`coach`) tampoco. Devuelve el id del administrador.
 */
export function requireOrgAdmin(actor: Actor): string {
  if (actor.kind !== 'user' || actor.role !== 'admin') {
    throw forbidden('Solo los administradores del club pueden hacer esto')
  }
  return actor.userId
}

/** Rol del usuario en la organización, o 403 si no es miembro. */
async function memberRole(org: Org, userId: string): Promise<MemberRole> {
  const { data, error } = await db()
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw forbidden()
  return data.role === 'admin' ? 'admin' : 'coach'
}

type Scope = { header: string; expected: string | undefined; disabled: string }

/** Lanza 401 si la cabecera no trae la palabra clave correcta (comparación en tiempo constante). */
async function requireSafeword(request: Request, { header, expected, disabled }: Scope): Promise<void> {
  if (!expected) throw new HttpError(503, 'admin_disabled', disabled)
  const given = safewordFrom(request, header)
  if (given && timingSafeEqual(digest(given), digest(expected))) return

  await delayFailure()
  throw unauthorized('Palabra clave incorrecta')
}

async function authorize(request: Request, org: Org, scope: Scope): Promise<Actor> {
  const token = bearerFrom(request)
  if (token) {
    const userId = await userIdFromToken(token)
    return { kind: 'user', userId, role: await memberRole(org, userId) }
  }

  // Una palabra clave nunca abre otra organización: solo existe una por despliegue y es la de la organización por defecto.
  if (!org.isDefault) {
    await delayFailure()
    throw unauthorized('Inicia sesión para administrar esta organización')
  }
  await requireSafeword(request, scope)
  return { kind: 'safeword' }
}

export function requireAdmin(request: Request, org: Org): Promise<Actor> {
  return authorize(request, org, {
    header: ADMIN_SAFEWORD_HEADER,
    expected: env.adminSafeword,
    disabled: 'La carga de datos no está configurada en el servidor (falta ADMIN_SAFEWORD).',
  })
}

export function requireFlyersAccess(request: Request, org: Org): Promise<Actor> {
  return authorize(request, org, {
    header: FLYERS_SAFEWORD_HEADER,
    expected: env.flyersSafeword,
    disabled: 'La sección de flyers no está configurada en el servidor (falta FLYERS_SAFEWORD).',
  })
}
