// Temporadas de ligas de CourtTrack que sigue la organización (tabla courtrack_leagues). El microservicio las lee al
// sincronizar, guarda la instantánea y las archiva cuando CourtTrack resetea la liga; aquí se crean, pausan y consultan.
import { slugify } from '../../shared/matches.js'
import type { CourtrackLeague, CourtrackLeagueSnapshot, LeagueCreateInput, LeagueUpdateInput } from '../../shared/schemas.js'
import { ensureCompetition, requireCompetition } from './competitions.js'
import { getCourtrackEquipos, getCourtrackLigas } from './courtrackSync.js'
import { env } from './env.js'
import { badRequest, conflict, notFound } from './http.js'
import { toCompetition } from './mappers.js'
import { db } from './supabase.js'
import { getOwnTeam } from './teams.js'

const UNIQUE_VIOLATION = '23505'

/**
 * Solo se puede seguir una liga como el equipo propio de la organización (teams.is_own_team), comparando el nombre
 * sin mayúsculas ni acentos: "MI EQUIPO" en CourtTrack es "Mi Equipo" en el dashboard. Evita seguir ligas de otro equipo.
 */
async function requireOwnTeamName(courtrackName: string): Promise<void> {
  const own = await getOwnTeam()
  if (slugify(own.name) !== slugify(courtrackName)) {
    throw badRequest(`Solo puedes seguir ligas en las que juegue ${own.name} (en CourtTrack aparece "${courtrackName}")`)
  }
}

// Un único literal: el cliente de Supabase infiere el tipo del select solo desde literales.
const LEAGUE_SELECT =
  'id,id_cliente,cliente_name,liga_id,liga_name,season_label,team_name,team_logo_url,is_active,last_synced_at,archived_at,archive_reason,snapshot_at,competition:competitions!courtrack_leagues_competition_id_fkey(id,name,kind)'

type LeagueRow = Omit<CourtrackLeague, 'competition' | 'archive_reason'> & {
  archive_reason: string | null
  competition: { id: string; name: string; kind: string } | null
}

const REASONS = ['reset', 'removed'] as const

function toLeague(row: LeagueRow): CourtrackLeague {
  if (!row.competition) throw new Error(`La liga ${row.id} no tiene competición`)
  const { competition, archive_reason, ...rest } = row
  return {
    ...rest,
    archive_reason: REASONS.find((value) => value === archive_reason) ?? null,
    competition: toCompetition(competition),
  }
}

/** Todas las temporadas: abiertas primero (activas antes que pausadas), archivadas al final. */
export async function listLeagues(): Promise<CourtrackLeague[]> {
  const { data, error } = await db()
    .from('courtrack_leagues')
    .select(LEAGUE_SELECT)
    .eq('org_id', env.orgId)
    .order('archived_at', { ascending: false, nullsFirst: true })
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(toLeague)
}

async function getLeagueRow(id: string): Promise<LeagueRow> {
  const { data, error } = await db()
    .from('courtrack_leagues')
    .select(LEAGUE_SELECT)
    .eq('id', id)
    .eq('org_id', env.orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('La liga no existe')
  return data
}

/**
 * Da de alta una liga (su temporada actual): comprueba en CourtTrack (vía el microservicio) que la liga y el equipo
 * existen, copia sus nombres y logo, y la cuelga de una competición existente o nueva.
 */
export async function createLeague(input: LeagueCreateInput): Promise<CourtrackLeague> {
  const ligas = await getCourtrackLigas(input.id_cliente)
  const liga = ligas.find((item) => item.id === input.liga_id)
  if (!liga) throw badRequest('Esa liga no existe en CourtTrack para la asociación elegida')

  const equipos = await getCourtrackEquipos(input.id_cliente, input.liga_id)
  const team = equipos.find((item) => item.name === input.team_name)
  if (!team) throw badRequest('Ese equipo no juega en la liga elegida')
  await requireOwnTeamName(team.name)

  const competition =
    input.competition.kind === 'existing'
      ? await requireCompetition(input.competition.id)
      : await ensureCompetition(input.competition.name, input.competition.competition_kind)

  const { data, error } = await db()
    .from('courtrack_leagues')
    .insert({
      org_id: env.orgId,
      competition_id: competition.id,
      id_cliente: input.id_cliente,
      cliente_name: input.cliente_name,
      liga_id: liga.id,
      liga_name: liga.nombre,
      season_label: liga.nombre,
      team_name: team.name,
      team_logo_url: team.logo,
    })
    .select(LEAGUE_SELECT)
    .single()
  if (error?.code === UNIQUE_VIOLATION) throw conflict('Esa liga ya está configurada (temporada abierta)')
  if (error) throw error
  return toLeague(data)
}

export async function updateLeague(input: LeagueUpdateInput): Promise<CourtrackLeague> {
  const current = await getLeagueRow(input.id)
  // Las temporadas las cierra el sync cuando CourtTrack reinicia la liga; aquí solo se consultan o quitan.
  if (current.archived_at) throw badRequest('La temporada ya finalizó: solo se puede consultar o quitar')

  if (input.team_name === current.team_name) return toLeague(current)
  const equipos = await getCourtrackEquipos(current.id_cliente, current.liga_id)
  if (!equipos.some((item) => item.name === input.team_name)) throw badRequest('Ese equipo no juega en la liga')
  await requireOwnTeamName(input.team_name)

  const { data, error } = await db()
    .from('courtrack_leagues')
    .update({ team_name: input.team_name })
    .eq('id', input.id)
    .eq('org_id', env.orgId)
    .select(LEAGUE_SELECT)
    .single()
  if (error) throw error
  return toLeague(data)
}

/**
 * Quita la temporada. Los partidos importados se conservan (con su courtrack_id, así que volver a añadir la liga los
 * vuelve a reconocer); solo pierden el vínculo con la temporada (on delete set null). La competición se conserva.
 */
export async function deleteLeague(id: string): Promise<void> {
  await getLeagueRow(id)
  const { error } = await db().from('courtrack_leagues').delete().eq('id', id).eq('org_id', env.orgId)
  if (error) throw error
}

/** Clasificación y fixture guardados en el último sync de la temporada (congelados si está archivada). */
export async function getLeagueSnapshot(id: string): Promise<CourtrackLeagueSnapshot> {
  const { data, error } = await db()
    .from('courtrack_leagues')
    .select('id,season_label,snapshot_at,standings,fixture')
    .eq('id', id)
    .eq('org_id', env.orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw notFound('La liga no existe')
  return {
    id: data.id,
    season_label: data.season_label,
    snapshot_at: data.snapshot_at,
    standings: Array.isArray(data.standings) ? data.standings : null,
    fixture: Array.isArray(data.fixture) ? data.fixture : null,
  }
}
