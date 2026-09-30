// Acceso a datos de equipos rivales.
import type { NewTeamInput, OpponentInput, TeamSummary } from '../../shared/schemas.js'
import { badRequest, conflict } from './http.js'
import { toTeamSummary } from './mappers.js'
import { db } from './supabase.js'
import type { Org } from './tenant.js'

const UNIQUE_VIOLATION = '23505'

/** Rivales (todos los equipos de la organización salvo el propio), por nombre. */
export async function listRivalTeams(org: Org): Promise<TeamSummary[]> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url')
    .eq('org_id', org.id)
    .eq('is_own_team', false)
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

/** El equipo propio de la organización (is_own_team). 500 claro si el seed no lo creó. */
export async function getOwnTeam(org: Org): Promise<TeamSummary> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url')
    .eq('org_id', org.id)
    .eq('is_own_team', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`La organización ${org.slug} no tiene ningún equipo propio en la tabla teams (is_own_team = true)`)
  return data
}

/** Rival de la organización por id. Null si no existe, es de otra organización o es el equipo propio. */
export async function getRivalTeam(org: Org, id: string): Promise<TeamSummary | null> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url,is_own_team')
    .eq('id', id)
    .eq('org_id', org.id)
    .maybeSingle()
  if (error) throw error
  return data && !data.is_own_team ? toTeamSummary(data) : null
}

/** Crea un rival: nunca es el equipo propio y no lleva categoría ni ciudad. */
export async function createRivalTeam(org: Org, input: NewTeamInput): Promise<TeamSummary> {
  const { data, error } = await db()
    .from('teams')
    .insert({
      org_id: org.id,
      name: input.name,
      short_name: input.short_name,
      logo_url: input.logo_url,
      is_own_team: false,
      category: null,
      city: null,
    })
    .select('id,name,short_name,logo_url')
    .single()
  if (error?.code === UNIQUE_VIOLATION) {
    throw conflict(`Ya existe un equipo llamado "${input.name}". Elígelo en la lista de equipos existentes.`)
  }
  if (error) throw error
  return data
}

export async function deleteTeam(org: Org, id: string): Promise<void> {
  const { error } = await db().from('teams').delete().eq('id', id).eq('org_id', org.id)
  if (error) throw error
}

export type ResolvedOpponent = {
  team: TeamSummary | null
  /** true si se acaba de crear: quien llama lo borra si luego falla su propio guardado. */
  created: boolean
}

/** Traduce el rival del formulario a un equipo: ninguno, uno existente o uno nuevo. */
export async function resolveOpponent(org: Org, input: OpponentInput): Promise<ResolvedOpponent> {
  if (input.kind === 'none') return { team: null, created: false }
  if (input.kind === 'existing') {
    const team = await getRivalTeam(org, input.team_id)
    if (!team) throw badRequest('El equipo rival elegido no existe')
    return { team, created: false }
  }
  return { team: await createRivalTeam(org, input.team), created: true }
}

/** Borra un rival recién creado cuando el guardado que lo usaba falló. Nunca lanza. */
export async function discardCreatedTeam(org: Org, resolved: ResolvedOpponent): Promise<void> {
  if (!resolved.created || !resolved.team) return
  await deleteTeam(org, resolved.team.id).catch((err: unknown) => console.error(err))
}
