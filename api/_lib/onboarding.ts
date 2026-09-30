// Onboarding del usuario: sus clubes, crear uno propio, unirse con un código y salir. No pasa por x-org-slug (todavía no
// hay club); las operaciones que tienen que ser atómicas viven en funciones SQL (supabase/migrations/…_onboarding.sql).
import { slugify } from '../../shared/matches.js'
import {
  MEMBER_ROLES,
  normalizeInviteCode,
  INVITE_CODE_LENGTH,
  type InviteAcceptInput,
  type JoinedOrg,
  type MemberRole,
  type MyOrg,
  type MyOrgs,
  type OrgCreateInput,
  type OrgLeaveInput,
  type OrgThemeInput,
} from '../../shared/onboarding.js'
import { delayFailure } from './admin.js'
import { HttpError, notFound } from './http.js'
import { db } from './supabase.js'

const SLUG_MAX = 40
/** Cuántos sufijos (-2, -3…) se prueban si el slug ya existe antes de rendirse. */
const SLUG_ATTEMPTS = 20

const toRole = (value: string): MemberRole => MEMBER_ROLES.find((role) => role === value) ?? 'coach'

/** Mensaje de una excepción de las funciones SQL (`raise exception 'codigo'`). */
const sqlCode = (error: { message?: string } | null): string => (error?.message ?? '').trim()

/** Los clubes del usuario y si puede crear uno (tiene permiso de creador y aún le queda cupo). */
export async function listMyOrgs(userId: string): Promise<MyOrgs> {
  const [{ data: rows, error }, { data: creator, error: creatorError }, { count, error: countError }] = await Promise.all([
    db().from('org_members').select('role, organization:organizations(slug,name)').eq('user_id', userId),
    db().from('org_creators').select('max_orgs').eq('user_id', userId).maybeSingle(),
    db().from('organizations').select('id', { count: 'exact', head: true }).eq('created_by', userId),
  ])
  if (error) throw error
  if (creatorError) throw creatorError
  if (countError) throw countError

  const orgs: MyOrg[] = rows
    .flatMap((row) => (row.organization ? [{ slug: row.organization.slug, name: row.organization.name, role: toRole(row.role) }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return { orgs, can_create_org: creator !== null && (count ?? 0) < creator.max_orgs }
}

/** Guarda la marca del club recién creado: los colores en `organizations.theme` y el escudo también en su equipo propio. */
async function applyTheme(slug: string, theme: OrgThemeInput): Promise<void> {
  const { data: org, error } = await db()
    .from('organizations')
    .update({ theme: Object.fromEntries(Object.entries(theme).filter(([, value]) => value !== undefined)) })
    .eq('slug', slug)
    .select('id')
    .single()
  if (error) throw error
  if (theme.logo_url) {
    const { error: logoError } = await db().from('teams').update({ logo_url: theme.logo_url }).eq('org_id', org.id).eq('is_own_team', true)
    if (logoError) throw logoError
  }
}

/**
 * Crea un club: el usuario queda como administrador y se crea su equipo propio (con el nombre del club). El slug sale del
 * nombre ("Club Los Halcones" → "club-los-halcones") y, si está cogido, se le añade -2, -3…; el usuario no lo ve.
 * 402 `plan_required` si su cuenta no tiene permiso de creador (el futuro muro de pago); 409 `org_limit_reached` si ya
 * creó todos los clubes que permite.
 */
export async function createMyOrg(userId: string, input: OrgCreateInput): Promise<MyOrg> {
  const base = slugify(input.name).slice(0, SLUG_MAX).replace(/-+$/, '') || 'club'
  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 1 ? base : `${base.slice(0, SLUG_MAX - 3)}-${attempt}`
    const { error } = await db().rpc('create_organization', { p_user: userId, p_name: input.name, p_slug: slug })
    if (!error) {
      if (input.theme) await applyTheme(slug, input.theme)
      return { slug, name: input.name, role: 'admin' }
    }

    switch (sqlCode(error)) {
      case 'slug_taken':
        continue
      case 'plan_required':
        throw new HttpError(402, 'plan_required', 'Tu cuenta todavía no puede crear clubes.')
      case 'org_limit_reached':
        throw new HttpError(409, 'org_limit_reached', 'Ya creaste el máximo de clubes que permite tu cuenta.')
      default:
        throw error
    }
  }
  throw new HttpError(409, 'slug_taken', 'No se pudo encontrar un identificador libre para ese nombre. Prueba con otro.')
}

/**
 * Une al usuario al club del código. Si ya es miembro no consume un uso y conserva su rol (`already_member`).
 * 404 `invite_invalid` (no existe o está revocado) y 409 `invite_exhausted` (ya se usó el máximo de veces).
 */
export async function acceptInvite(userId: string, input: InviteAcceptInput): Promise<JoinedOrg> {
  const code = normalizeInviteCode(input.code)
  if (code.length !== INVITE_CODE_LENGTH) {
    await delayFailure()
    throw notFound('Ese código no es válido')
  }

  const { data, error } = await db().rpc('accept_org_invite', { p_code: code, p_user: userId })
  if (error) {
    switch (sqlCode(error)) {
      case 'invite_invalid':
        await delayFailure()
        throw new HttpError(404, 'invite_invalid', 'Ese código no es válido o ya no está activo.')
      case 'invite_exhausted':
        throw new HttpError(409, 'invite_exhausted', 'Ese código ya se usó el máximo de veces. Pide uno nuevo al administrador.')
      default:
        throw error
    }
  }
  const joined = data[0]
  if (!joined) throw new Error('accept_org_invite no devolvió el club')
  return { slug: joined.slug, name: joined.name, role: toRole(joined.role), already_member: joined.already_member }
}

/** El usuario sale de un club. 409 `last_admin` si es el único administrador. */
export async function leaveOrg(userId: string, input: OrgLeaveInput): Promise<void> {
  const { data: org, error: orgError } = await db().from('organizations').select('id').eq('slug', input.slug).maybeSingle()
  if (orgError) throw orgError
  if (!org) throw notFound('El club no existe')

  const { error } = await db().rpc('remove_org_member', { p_org: org.id, p_user: userId })
  if (error) {
    switch (sqlCode(error)) {
      case 'member_not_found':
        throw notFound('No eres miembro de ese club')
      case 'last_admin':
        throw new HttpError(409, 'last_admin', 'Eres el único administrador: nombra a otro antes de salir.')
      default:
        throw error
    }
  }
}
