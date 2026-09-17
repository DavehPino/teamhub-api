// Conversión de filas de Postgres a los contratos de shared/schemas.ts.
// Los enums viajan como `text` en la base de datos; aquí se validan contra shared/domain.ts.
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_TYPES,
  COMPETITION_KINDS,
  PLAYER_POSITIONS,
  VIDEO_CATEGORIES,
  VIDEO_SOURCES,
  VIDEO_STATUSES,
  type ActivityCategory,
  type ActivityType,
  type CompetitionKind,
  type MatchOutcome,
  type PlayerPosition,
  type VideoCategory,
  type VideoSource,
  type VideoStatus,
} from '../../shared/domain.js'
import {
  setScoreSchema,
  type Activity,
  type Competition,
  type Lineup,
  type LineupSlot,
  type Player,
  type SetScore,
  type TeamSummary,
  type Video,
} from '../../shared/schemas.js'
import type { Tables } from './supabase.js'

type ActivityRow = Tables['weekly_activities']['Row']
type VideoRow = Tables['videos']['Row']
type PlayerRow = Tables['players']['Row']
type LineupRow = Tables['lineups']['Row']
type LineupPlayerRow = Tables['lineup_players']['Row']

export const TEAM_SUMMARY_SELECT = 'id,name,short_name,logo_url'

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback
}

export function toTeamSummary(row: TeamSummary | null): TeamSummary | null {
  if (!row) return null
  return { id: row.id, name: row.name, short_name: row.short_name, logo_url: row.logo_url }
}

export const COMPETITION_SELECT = 'id,name,kind'

export function toCompetition(row: { id: string; name: string; kind: string }): Competition {
  return { id: row.id, name: row.name, kind: oneOf<CompetitionKind>(COMPETITION_KINDS, row.kind, 'other') }
}

export function toActivity(row: ActivityRow, opponent: TeamSummary | null): Activity {
  return {
    id: row.id,
    title: row.title,
    activity_type: oneOf<ActivityType>(ACTIVITY_TYPES, row.activity_type, 'otro'),
    category: oneOf<ActivityCategory>(ACTIVITY_CATEGORIES, row.category, 'general'),
    activity_date: row.activity_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location: row.location,
    description: row.description,
    is_cancelled: row.is_cancelled,
    opponent: toTeamSummary(opponent),
  }
}

export function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source: oneOf<VideoSource>(VIDEO_SOURCES, row.source, 'bucket'),
    storage_key: row.storage_key,
    url: row.url,
    thumbnail_url: row.thumbnail_url,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    duration_seconds: row.duration_seconds,
    category: oneOf<VideoCategory>(VIDEO_CATEGORIES, row.category, 'sin_clasificar'),
    recorded_on: row.recorded_on,
    tags: row.tags,
    status: oneOf<VideoStatus>(VIDEO_STATUSES, row.status, 'pending'),
    match_id: row.match_id,
    set_number: row.set_number,
    sort_order: row.sort_order,
  }
}

export function outcomeOf(setsWon: number | null, setsLost: number | null): MatchOutcome {
  if (setsWon === null || setsLost === null) return 'pending'
  if (setsWon > setsLost) return 'win'
  if (setsWon < setsLost) return 'loss'
  return 'pending'
}

/** Valida el jsonb de parciales; descarta entradas mal formadas en vez de romper la respuesta. */
export function toSetScores(raw: unknown): SetScore[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = setScoreSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

/** Orden de los videos dentro de un partido: set_number (null primero), sort_order y título. */
export function compareVideos(a: Video, b: Video): number {
  const setA = a.set_number ?? -1
  const setB = b.set_number ?? -1
  if (setA !== setB) return setA - setB
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.title.localeCompare(b.title, 'es')
}

export const PLAYER_SELECT = 'id,name,jersey_number,primary_position,secondary_position,is_active'

export function toPlayer(
  row: Pick<PlayerRow, 'id' | 'name' | 'jersey_number' | 'primary_position' | 'secondary_position' | 'is_active'>,
): Player {
  const primary = oneOf<PlayerPosition>(PLAYER_POSITIONS, row.primary_position, 'comodin')
  const secondary = PLAYER_POSITIONS.find((position) => position === row.secondary_position) ?? null
  return {
    id: row.id,
    name: row.name,
    jersey_number: row.jersey_number,
    primary_position: primary,
    secondary_position: secondary === primary ? null : secondary,
    is_active: row.is_active,
  }
}

export const LINEUP_SELECT = 'id,name,notes,updated_at,lineup_players(player_id,x,y)'

/** `numeric` puede llegar como texto según el cliente: se normaliza a número. */
export function toLineup(
  row: Pick<LineupRow, 'id' | 'name' | 'notes' | 'updated_at'> & {
    lineup_players: Pick<LineupPlayerRow, 'player_id' | 'x' | 'y'>[]
  },
): Lineup {
  const slots: LineupSlot[] = row.lineup_players.map((slot) => ({
    player_id: slot.player_id,
    x: Number(slot.x),
    y: Number(slot.y),
  }))
  return { id: row.id, name: row.name, notes: row.notes, slots, updated_at: row.updated_at }
}
