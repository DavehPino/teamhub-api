// Acceso a datos de partidos: lecturas del dashboard, alta y edición desde /api/admin/*.
import { addDays, todayIsoDate } from '../../shared/dates.js'
import { matchSlugBase, tallySets } from '../../shared/matches.js'
import type {
  MatchCreated,
  MatchCreateInput,
  MatchDeleteInput,
  MatchDetail,
  MatchSummary,
  MatchUpdateInput,
  TeamSummary,
  Video,
} from '../../shared/schemas.js'
import { requireCompetition } from './competitions.js'
import { badRequest, notFound } from './http.js'
import { compareVideos, outcomeOf, toCompetition, toSetScores, toVideo } from './mappers.js'
import { deleteObject, listObjectKeys, matchFolderKey } from './storage.js'
import { db, type Tables } from './supabase.js'
import { discardCreatedTeam, resolveOpponent } from './teams.js'

type MatchRow = Tables['matches']['Row']

// Un único literal: el cliente de Supabase infiere el tipo del select solo desde literales.
const MATCH_SUMMARY_SELECT =
  '*, opponent:teams!matches_opponent_team_id_fkey(id,name,short_name,logo_url), competition:competitions!matches_competition_id_fkey(id,name,kind), videos(count)'

type CountEmbed = { count: number }[]
type CompetitionEmbed = { id: string; name: string; kind: string } | null
/** La fila sin el texto `competition` (columna heredada; el embed `competition` lo sustituye). */
type MatchRowData = Omit<MatchRow, 'competition'>

function toMatchSummary(row: MatchRowData, opponent: TeamSummary, competition: CompetitionEmbed, videos: CountEmbed): MatchSummary {
  return {
    id: row.id,
    slug: row.slug,
    played_on: row.played_on,
    start_time: row.start_time,
    is_home: row.is_home,
    location: row.location,
    competition: competition ? toCompetition(competition) : null,
    phase: row.phase,
    sets_won: row.sets_won,
    sets_lost: row.sets_lost,
    outcome: outcomeOf(row.sets_won, row.sets_lost),
    cover_image_url: row.cover_image_url,
    opponent,
    video_count: videos[0]?.count ?? 0,
  }
}

/**
 * Partidos jugados hasta `until` (incluido), del más reciente al más antiguo; opcionalmente de una o varias
 * competiciones y de una temporada de CourtTrack.
 */
export async function listMatchesUntil(
  until: string,
  limit: number,
  competitionIds?: string[],
  leagueId?: string,
): Promise<MatchSummary[]> {
  let query = db().from('matches').select(MATCH_SUMMARY_SELECT).lte('played_on', until)
  if (competitionIds?.length) query = query.in('competition_id', competitionIds)
  if (leagueId) query = query.eq('courtrack_league_id', leagueId)
  const { data, error } = await query
    .order('played_on', { ascending: false })
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error

  return data.map(({ opponent, competition, videos, ...row }) => toMatchSummary(row, opponent, competition, videos))
}

/** Detalle de un partido con parciales y videos ordenados. Null si el slug no existe. */
export async function getMatchBySlug(slug: string): Promise<MatchDetail | null> {
  const { data, error } = await db().from('matches').select(MATCH_SUMMARY_SELECT).eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) return null

  const { opponent, competition, videos: videoCount, ...row } = data
  const { data: videoRows, error: videosError } = await db()
    .from('videos')
    .select('*')
    .eq('match_id', row.id)
    .neq('status', 'archived')
  if (videosError) throw videosError

  const videos: Video[] = videoRows.map(toVideo).sort(compareVideos)
  return {
    ...toMatchSummary(row, opponent, competition, videoCount),
    set_scores: toSetScores(row.set_scores),
    summary: row.summary,
    videos,
    courtrack_id: row.courtrack_id,
  }
}

export type MatchRef = Pick<MatchRow, 'id' | 'slug' | 'played_on'>

export async function getMatchRef(id: string): Promise<MatchRef | null> {
  const { data, error } = await db().from('matches').select('id,slug,played_on').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

const UNIQUE_VIOLATION = '23505'

/** Solo partidos ya jugados. Tolerancia de un día: el reloj del servidor puede ir por detrás de la hora local del equipo. */
function assertPlayed(playedOn: string): void {
  if (playedOn > addDays(todayIsoDate(), 1)) throw badRequest('La fecha del partido no puede estar en el futuro')
}
const SLUG_ATTEMPTS = 3

/** Primer slug libre: base, base-2, base-3... */
async function freeSlug(base: string): Promise<string> {
  const { data, error } = await db().from('matches').select('slug').like('slug', `${base}%`)
  if (error) throw error
  const taken = new Set(data.map((row) => row.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`
  return slug
}

/**
 * Crea el partido y, si hace falta, el rival. Siempre como visitante (is_home = false).
 * Si el partido no se puede guardar, el rival recién creado se borra para no dejar restos.
 */
export async function createMatch(input: MatchCreateInput): Promise<MatchCreated> {
  assertPlayed(input.played_on)
  const competition = await requireCompetition(input.competition_id)

  const resolved = await resolveOpponent(input.opponent)
  const opponent = resolved.team as TeamSummary // los partidos siempre tienen rival

  const { won, lost } = tallySets(input.set_scores)
  const base = matchSlugBase(input.played_on, opponent.name)

  try {
    for (let attempt = 1; ; attempt += 1) {
      const slug = await freeSlug(base)
      const { data, error } = await db()
        .from('matches')
        .insert({
          slug,
          played_on: input.played_on,
          start_time: input.start_time,
          opponent_team_id: opponent.id,
          is_home: false,
          location: input.location,
          competition_id: competition.id,
          phase: input.phase,
          sets_won: won,
          sets_lost: lost,
          set_scores: input.set_scores,
        })
        .select('id,slug')
        .single()
      // Un alta simultánea se quedó con el mismo slug: se recalcula.
      if (error?.code === UNIQUE_VIOLATION && attempt < SLUG_ATTEMPTS) continue
      if (error) throw error
      return { id: data.id, slug: data.slug, opponent }
    }
  } catch (err) {
    await discardCreatedTeam(resolved)
    throw err
  }
}

/**
 * Edita los datos de un partido (rival, fecha, competición, parciales...). El slug no cambia: es la URL del
 * partido y el nombre de su carpeta en el bucket, donde ya pueden estar sus videos.
 */
export async function updateMatch(input: MatchUpdateInput): Promise<MatchCreated> {
  assertPlayed(input.played_on)
  const current = await getMatchRef(input.id)
  if (!current) throw notFound('Partido no encontrado')
  const competition = await requireCompetition(input.competition_id)

  const resolved = await resolveOpponent(input.opponent)
  const opponent = resolved.team as TeamSummary
  const { won, lost } = tallySets(input.set_scores)

  const { error } = await db()
    .from('matches')
    .update({
      played_on: input.played_on,
      start_time: input.start_time,
      opponent_team_id: opponent.id,
      location: input.location,
      competition_id: competition.id,
      phase: input.phase,
      sets_won: won,
      sets_lost: lost,
      set_scores: input.set_scores,
    })
    .eq('id', input.id)
  if (error) {
    await discardCreatedTeam(resolved)
    throw error
  }

  // Los videos que tenían la fecha del partido la siguen teniendo; una fecha editada a mano se respeta.
  if (input.played_on !== current.played_on) {
    const { error: videosError } = await db()
      .from('videos')
      .update({ recorded_on: input.played_on })
      .eq('match_id', current.id)
      .eq('recorded_on', current.played_on)
    if (videosError) console.error(videosError)
  }

  return { id: current.id, slug: current.slug, opponent }
}

/** Archivos que se borran a la vez al eliminar un partido. */
const DELETE_CONCURRENCY = 5

/**
 * Elimina el partido con todos sus videos: primero los archivos del bucket (su carpeta y cualquier otro vinculado),
 * después las filas de videos y por último el partido. Si el bucket falla no se borra nada de la base de datos, y
 * repetir la operación es seguro. El rival no se borra.
 */
export async function deleteMatch(input: MatchDeleteInput): Promise<void> {
  const match = await getMatchRef(input.id)
  if (!match) throw notFound('Partido no encontrado')

  const { data: videoRows, error: videosError } = await db()
    .from('videos')
    .select('storage_key')
    .eq('match_id', match.id)
    .eq('source', 'bucket')
  if (videosError) throw videosError

  const keys = new Set(await listObjectKeys(matchFolderKey(match.slug)))
  for (const row of videoRows) if (row.storage_key) keys.add(row.storage_key)
  const pending = [...keys]
  await Promise.all(
    Array.from({ length: Math.min(DELETE_CONCURRENCY, pending.length) }, async () => {
      for (let key = pending.pop(); key !== undefined; key = pending.pop()) await deleteObject(key)
    }),
  )

  const { error: deleteVideosError } = await db().from('videos').delete().eq('match_id', match.id)
  if (deleteVideosError) throw deleteVideosError
  const { error } = await db().from('matches').delete().eq('id', match.id)
  if (error) throw error
}
