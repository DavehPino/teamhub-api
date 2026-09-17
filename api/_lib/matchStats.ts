// Progresión y estadísticas de un partido importado de CourtTrack, vistas desde el equipo propio (us/them).
// CourtTrack habla de lados A y B; `matches.is_home` dice cuál es el nuestro (true = A, como decide el sync).
import type {
  CourtrackPartido,
  CourtrackSet,
  MatchSetEvent,
  MatchSetStats,
  MatchSide,
  MatchStats,
} from '../../shared/schemas.js'
import { getCourtrackPartido } from './courtrackSync.js'
import { HttpError } from './http.js'
import { db } from './supabase.js'

type Side = 'a' | 'b'

/** Null si el partido no existe. 404 `no_stats` si no viene de CourtTrack. */
export async function getMatchStatsBySlug(slug: string): Promise<MatchStats | null> {
  const { data, error } = await db().from('matches').select('id,is_home,courtrack_id').eq('slug', slug).maybeSingle()
  if (error) throw error
  if (!data) return null

  const courtrackId = Number(data.courtrack_id)
  if (!data.courtrack_id || !Number.isInteger(courtrackId)) {
    throw new HttpError(404, 'no_stats', 'Este partido no viene de CourtTrack: no hay progresión ni estadísticas.')
  }
  const partido = await getCourtrackPartido(courtrackId)
  return toMatchStats(partido, data.is_home ? 'a' : 'b', data.courtrack_id)
}

export function toMatchStats(partido: CourtrackPartido, ours: Side, courtrackId: string): MatchStats {
  const sideOf = (side: Side): MatchSide => (side === ours ? 'us' : 'them')
  const pair = <T>(a: T, b: T): Record<MatchSide, T> => (ours === 'a' ? { us: a, them: b } : { us: b, them: a })
  const ownName = ours === 'a' ? partido.team_a : partido.team_b

  const toSet = (set: CourtrackSet): MatchSetStats => ({
    number: set.number,
    score: pair(set.score_a, set.score_b),
    duration_minutes: set.duration_minutes,
    timeouts: pair(set.timeouts_a, set.timeouts_b),
    substitutions: pair(set.substitutions_a, set.substitutions_b),
    stats: pair(set.stats_a, set.stats_b),
    lineup: ours === 'a' ? set.lineup_a : set.lineup_b,
    events: set.events.map(
      (event): MatchSetEvent => ({
        ...pair(event.score_a, event.score_b),
        team: sideOf(event.side),
        kind: event.kind,
        player: event.player,
        detail: event.detail,
      }),
    ),
  })

  return {
    courtrack_id: courtrackId,
    duration: partido.duration,
    started_at: partido.started_at,
    ended_at: partido.ended_at,
    mvp: partido.mvp && { name: partido.mvp.name, number: partido.mvp.number, team: partido.mvp.team === ownName ? 'us' : 'them' },
    sets: partido.sets.map(toSet),
    totals: pair(partido.totals_a, partido.totals_b),
    players: partido.players
      .filter((player) => player.team === ownName)
      .map(({ team: _team, ...player }) => player),
  }
}
