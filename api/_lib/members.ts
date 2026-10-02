// Gestión del club por sus administradores: miembros e invitaciones. Las altas y bajas que no pueden dejar el club sin
// administrador viven en funciones SQL atómicas (supabase/migrations/…_onboarding.sql).
import { randomInt } from 'node:crypto'
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MEMBER_ROLES,
  formatInviteCode,
  normalizeInviteCode,
  type InviteCreateInput,
  type InviteRevokeInput,
  type MemberRemoveInput,
  type MemberRole,
  type MemberRoleInput,
  type OrgUpdateInput,
  type OrgInfo,
  type OrgInvite,
  type OrgMember,
} from '../../shared/onboarding.js'
import { HttpError, notFound } from './http.js'
import { db } from './supabase.js'
import type { Org } from './tenant.js'

const UNIQUE_VIOLATION = '23505'
const CODE_ATTEMPTS = 5

const toRole = (value: string): MemberRole => MEMBER_ROLES.find((role) => role === value) ?? 'coach'
const sqlCode = (error: { message?: string } | null): string => (error?.message ?? '').trim()

function newInviteCode(): string {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join('')
}

/** Datos públicos del club: lo que ve un invitado sin cuenta (nombre y tema). */
export async function getOrgInfo(org: Org): Promise<OrgInfo> {
  const { data, error } = await db().from('organizations').select('slug,name,theme').eq('id', org.id).single()
  if (error) throw error
  const theme = data.theme && typeof data.theme === 'object' && !Array.isArray(data.theme) ? data.theme : {}
  return { slug: data.slug, name: data.name, theme }
}

/** Miembros del club, administradores primero. El email y el nombre salen de la cuenta de Supabase Auth. */
export async function listMembers(org: Org, meId: string): Promise<OrgMember[]> {
  const { data, error } = await db().from('org_members').select('user_id,role,created_at').eq('org_id', org.id)
  if (error) throw error

  const members = await Promise.all(
    data.map(async (row): Promise<OrgMember> => {
      const { data: account } = await db().auth.admin.getUserById(row.user_id)
      const meta = account.user?.user_metadata as { full_name?: unknown; name?: unknown } | undefined
      const name = [meta?.full_name, meta?.name].find((value): value is string => typeof value === 'string' && value.trim() !== '')
      return {
        user_id: row.user_id,
        email: account.user?.email ?? null,
        name: name?.trim() ?? null,
        role: toRole(row.role),
        joined_at: row.created_at,
        is_me: row.user_id === meId,
      }
    }),
  )
  return members.sort((a, b) => (a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === 'admin' ? -1 : 1))
}

/**
 * Cambia el nombre y/o la marca del club. El nombre del club es también el de su equipo propio (el de los partidos), así
 * que se cambian juntos, y el escudo se copia al equipo propio. El slug no cambia nunca: es lo que usan los enlaces de
 * invitación y la cabecera x-org-slug. Los colores y el escudo se mezclan con los que ya hay; `null` quita uno.
 */
export async function updateOrg(org: Org, input: OrgUpdateInput): Promise<OrgInfo> {
  const { data: current, error } = await db().from('organizations').select('theme').eq('id', org.id).single()
  if (error) throw error
  const base: Record<string, string> = {}
  if (current.theme && typeof current.theme === 'object' && !Array.isArray(current.theme)) {
    for (const [key, value] of Object.entries(current.theme)) if (typeof value === 'string') base[key] = value
  }

  const patch: { name?: string; theme?: Record<string, string> } = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.theme !== undefined) {
    const merged = base
    for (const [key, value] of Object.entries(input.theme)) {
      if (value === undefined) continue
      if (value === null) delete merged[key]
      else merged[key] = value
    }
    patch.theme = merged
  }
  const { error: updateError } = await db().from('organizations').update(patch).eq('id', org.id)
  if (updateError) throw updateError

  const teamPatch: { name?: string; logo_url?: string | null } = {}
  if (input.name !== undefined) teamPatch.name = input.name
  if (input.theme?.logo_url !== undefined) teamPatch.logo_url = input.theme.logo_url
  if (Object.keys(teamPatch).length > 0) {
    const { error: teamError } = await db().from('teams').update(teamPatch).eq('org_id', org.id).eq('is_own_team', true)
    if (teamError) throw teamError
  }
  return getOrgInfo(org)
}

function memberError(error: { message?: string }): never {
  switch (sqlCode(error)) {
    case 'member_not_found':
      throw notFound('Esa persona no es miembro del club')
    case 'last_admin':
      throw new HttpError(409, 'last_admin', 'El club necesita al menos un administrador.')
    default:
      throw error
  }
}

export async function setMemberRole(org: Org, input: MemberRoleInput): Promise<void> {
  const { error } = await db().rpc('set_org_member_role', { p_org: org.id, p_user: input.user_id, p_role: input.role })
  if (error) memberError(error)
}

export async function removeMember(org: Org, input: MemberRemoveInput): Promise<void> {
  const { error } = await db().rpc('remove_org_member', { p_org: org.id, p_user: input.user_id })
  if (error) memberError(error)
}

const toInvite = (row: { code: string; role: string; max_uses: number | null; uses: number; created_at: string }): OrgInvite => ({
  code: formatInviteCode(row.code),
  role: toRole(row.role),
  max_uses: row.max_uses,
  uses: row.uses,
  created_at: row.created_at,
})

/** Crea un código de invitación. No caduca: se usa hasta `max_uses` veces (o sin límite) o hasta que se revoque. */
export async function createInvite(org: Org, createdBy: string, input: InviteCreateInput): Promise<OrgInvite> {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await db()
      .from('org_invites')
      .insert({ org_id: org.id, code: newInviteCode(), role: input.role, max_uses: input.max_uses, created_by: createdBy })
      .select('code,role,max_uses,uses,created_at')
      .single()
    if (error?.code === UNIQUE_VIOLATION) continue
    if (error) throw error
    return toInvite(data)
  }
  throw new Error('No se pudo generar un código de invitación único')
}

/** Invitaciones activas (no revocadas), la más reciente primero. */
export async function listInvites(org: Org): Promise<OrgInvite[]> {
  const { data, error } = await db()
    .from('org_invites')
    .select('code,role,max_uses,uses,created_at')
    .eq('org_id', org.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(toInvite)
}

/** Desactiva el código: quien ya entró se queda; nadie más puede usarlo. */
export async function revokeInvite(org: Org, input: InviteRevokeInput): Promise<void> {
  const { data, error } = await db()
    .from('org_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('org_id', org.id)
    .eq('code', normalizeInviteCode(input.code))
    .is('revoked_at', null)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw notFound('Ese código no existe o ya estaba revocado')
}
