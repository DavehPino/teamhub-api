// Acceso a datos de equipos rivales.
import type { NewTeamInput, OpponentInput, TeamSummary } from '../../shared/schemas.js'
import { badRequest, conflict } from './http.js'
import { toTeamSummary } from './mappers.js'
import { db } from './supabase.js'

const UNIQUE_VIOLATION = '23505'

/** Rivales (todos los equipos salvo el propio), por nombre. */
export async function listRivalTeams(): Promise<TeamSummary[]> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url')
    .eq('is_own_team', false)
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

/** El equipo propio de la organización (is_own_team). 500 claro si el seed no lo creó. */
export async function getOwnTeam(): Promise<TeamSummary> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url')
    .eq('is_own_team', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No hay ningún equipo propio en la tabla teams (is_own_team = true)')
  return data
}

/** Rival por id. Null si no existe o si es el equipo propio. */
export async function getRivalTeam(id: string): Promise<TeamSummary | null> {
  const { data, error } = await db()
    .from('teams')
    .select('id,name,short_name,logo_url,is_own_team')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data && !data.is_own_team ? toTeamSummary(data) : null
}

/** Crea un rival: nunca es el equipo propio y no lleva categoría ni ciudad. */
export async function createRivalTeam(input: NewTeamInput): Promise<TeamSummary> {
  const { data, error } = await db()
    .from('teams')
    .insert({
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

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await db().from('teams').delete().eq('id', id)
  if (error) throw error
}

export type ResolvedOpponent = {
  team: TeamSummary | null
  /** true si se acaba de crear: quien llama lo borra si luego falla su propio guardado. */
  created: boolean
}

/** Traduce el rival del formulario a un equipo: ninguno, uno existente o uno nuevo. */
export async function resolveOpponent(input: OpponentInput): Promise<ResolvedOpponent> {
  if (input.kind === 'none') return { team: null, created: false }
  if (input.kind === 'existing') {
    const team = await getRivalTeam(input.team_id)
    if (!team) throw badRequest('El equipo rival elegido no existe')
    return { team, created: false }
  }
  return { team: await createRivalTeam(input.team), created: true }
}

/** Borra un rival recién creado cuando el guardado que lo usaba falló. Nunca lanza. */
export async function discardCreatedTeam(resolved: ResolvedOpponent): Promise<void> {
  if (!resolved.created || !resolved.team) return
  await deleteTeam(resolved.team.id).catch((err: unknown) => console.error(err))
}
