// Contratos de la API (validados en backend, tipos compartidos con el frontend).
// Lecturas públicas para el dashboard; las escrituras (/api/admin/*) exigen la palabra clave.
import { z } from 'zod'
import {
  ACTIVITY_CATEGORIES,
  COMPETITION_KINDS,
  LINEUP_MAX_SLOTS,
  LINEUP_NAME_MAX,
  LINEUP_NOTES_MAX,
  MAX_SETS,
  MAX_VIDEO_BYTES,
  PLAYER_NAME_MAX,
  PLAYER_POSITIONS,
  type ActivityCategory,
  type ActivityType,
  type CompetitionKind,
  type MatchOutcome,
  type PlayerPosition,
  type VideoCategory,
  type VideoSource,
  type VideoStatus,
} from './domain.js'

const isoDate = z.iso.date()

// ─── Teams ───────────────────────────────────────────────────────────────────
export type Team = {
  id: string
  name: string
  short_name: string | null
  is_own_team: boolean
  category: string | null
  city: string | null
  logo_url: string | null
}

export type TeamSummary = Pick<Team, 'id' | 'name' | 'short_name' | 'logo_url'>

// ─── Competitions ────────────────────────────────────────────────────────────
/** Liga, amistoso, torneo... de la organización. Los partidos cuelgan de una competición. */
export type Competition = {
  id: string
  name: string
  kind: CompetitionKind
}

/** Temporada de CourtTrack que alimenta una competición (fila de courtrack_leagues). */
export type CompetitionSeason = {
  id: string
  label: string
  archived: boolean
  match_count: number
}

/** Listado para filtros y formularios: con el número de partidos jugados y sus temporadas. */
export type CompetitionListItem = Competition & { match_count: number; seasons: CompetitionSeason[] }

// ─── Activities ──────────────────────────────────────────────────────────────
export type Activity = {
  id: string
  title: string
  activity_type: ActivityType
  category: ActivityCategory
  activity_date: string // YYYY-MM-DD
  start_time: string | null // HH:MM:SS
  end_time: string | null
  location: string | null
  description: string | null
  is_cancelled: boolean
  opponent: TeamSummary | null
}

export const upcomingActivitiesQuery = z.object({
  // Primer día a incluir (YYYY-MM-DD): el "hoy" de quien consulta. Por defecto, hoy en el servidor.
  from: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

// ─── Videos ──────────────────────────────────────────────────────────────────
export type Video = {
  id: string
  title: string
  description: string | null
  source: VideoSource
  storage_key: string | null
  url: string | null
  thumbnail_url: string | null
  content_type: string | null
  size_bytes: number | null
  duration_seconds: number | null
  category: VideoCategory
  recorded_on: string | null
  tags: string[]
  status: VideoStatus
  match_id: string | null
  set_number: number | null
  sort_order: number
}

export type Playback = { url: string; expiresAt: string | null }

export type SyncResult = {
  scanned: number
  created: number
  updated: number
  linked_to_match: number
  missing_in_bucket: number
}

// ─── Sincronización con CourtTrack ───────────────────────────────────────────
// Copia de los contratos de courtrack-service (api/_lib/types.ts), que el dashboard consume vía /api/admin/courtrack-*.

/** Asociación en CourtTrack (PODIO = 5). */
export type CourtrackCliente = {
  id: number
  nombre: string
  titulo: string | null
  logo: string | null
  deporte: string | null
}

/** Liga dentro de una asociación. */
export type CourtrackLiga = {
  id: number
  nombre: string
  descripcion: string | null
  logo: string | null
  etapas: { id: number; titulo: string }[]
}

/** Equipo que juega en una liga (derivado de sus partidos). `name` es el nombre crudo que guarda la liga. */
export type CourtrackEquipo = {
  name: string
  display_name: string
  logo: string | null
  matches: number
}

/** Liga de una asociación en la que juega el equipo buscado (descubrimiento). */
export type CourtrackDiscoveredLiga = {
  liga: CourtrackLiga
  team: CourtrackEquipo
  total_matches: number
  played_matches: number
}

/**
 * Acciones de un equipo en un set o en el partido. `serve_errors` y `unforced_errors` son los errores que COMETIÓ el
 * equipo; `points` es su total anotado = attacks + aces + blocks + errores del rival.
 */
export type CourtrackStatLine = {
  attacks: number
  aces: number
  blocks: number
  serve_errors: number
  unforced_errors: number
  points: number
}

export type CourtrackSetEventKind =
  | 'attack'
  | 'ace'
  | 'block'
  | 'serve_error'
  | 'unforced_error'
  | 'timeout'
  | 'substitution'
  | 'other'

/** Un paso de la progresión de un set: quién hizo qué y cómo quedó el marcador. */
export type CourtrackSetEvent = {
  /** Marcador después del evento. */
  score_a: number
  score_b: number
  /** Equipo protagonista: el que anota o, en los errores, el que lo comete. */
  side: 'a' | 'b'
  kind: CourtrackSetEventKind
  player: { number: number | null; name: string } | null
  /** Texto de una sustitución: "Entra #27 Carrion · Sale #17 Rios". */
  detail: string | null
}

/** Jugador en la formación inicial de un set. `position` 1–6 es la zona de la rotación; 0, líbero. */
export type CourtrackSetLineupPlayer = {
  position: number
  number: number | null
  name: string
  short_name: string
  /** Saca primero en el set. */
  serving: boolean
}

export type CourtrackSet = {
  number: number
  score_a: number
  score_b: number
  duration_minutes: number | null
  timeouts_a: number
  timeouts_b: number
  substitutions_a: number
  substitutions_b: number
  stats_a: CourtrackStatLine | null
  stats_b: CourtrackStatLine | null
  lineup_a: CourtrackSetLineupPlayer[]
  lineup_b: CourtrackSetLineupPlayer[]
  events: CourtrackSetEvent[]
}

/** Estadísticas de un jugador en todo el partido (de los dos equipos). */
export type CourtrackPlayerStats = {
  id: number
  name: string
  short_name: string
  number: number | null
  /** Nombre del equipo tal como lo escribe CourtTrack (coincide con `team_a` o `team_b`). */
  team: string
  captain: boolean
  libero: boolean
  /** Puntos disputados en cancha. */
  rallies: number
  attacks: number
  aces: number
  blocks: number
  serve_errors: number
  unforced_errors: number
  /** Puntaje "AIScore" que calcula CourtTrack (puede ser negativo). */
  rating: number | null
}

/** Progresión, estadísticas y formaciones de un partido ya jugado (/api/courtrack/partido). */
export type CourtrackPartido = {
  id: number
  team_a: string
  team_b: string
  sets_a: number | null
  sets_b: number | null
  status: string
  /** "1h 55m", tal como lo formatea CourtTrack. */
  duration: string | null
  /** Hora real de inicio y fin ("16:06"). */
  started_at: string | null
  ended_at: string | null
  mvp: { name: string; number: number | null; team: string } | null
  sets: CourtrackSet[]
  totals_a: CourtrackStatLine | null
  totals_b: CourtrackStatLine | null
  players: CourtrackPlayerStats[]
}

export type CourtrackSyncQuota = {
  limit: number
  used: number
  remaining: number
  /** Cuándo se libera el cupo más antiguo de la ventana de 24 h. Null si no se usó ninguno. */
  resets_at: string | null
}

export type CourtrackSyncAction = 'created' | 'updated' | 'adopted' | 'unchanged' | 'skipped'

export type CourtrackSyncMatch = {
  courtrack_id: string
  played_on: string
  start_time: string | null
  /** Equipos en el orden de CourtTrack (home = equipo "a"). */
  home: string
  away: string
  home_sets: number | null
  away_sets: number | null
  status: string
  action: CourtrackSyncAction
  reason?: string
  slug?: string
  /** `courtrack_name`: nombre crudo en CourtTrack (para vincularlo a un rival); `renamed_from`: nombre anterior en el dashboard. */
  opponent?: { name: string; courtrack_name: string; created: boolean; renamed_from?: string }
}

export type CourtrackSyncSummary = {
  scanned: number
  own: number
  created: number
  updated: number
  adopted: number
  unchanged: number
  skipped: number
  rivals_created: string[]
}

/** CourtTrack reinició o eliminó la liga: la temporada se archivó (y, si sigue existiendo, se abrió otra). */
export type CourtrackSeasonEvent = {
  kind: 'reset' | 'removed'
  archived_season: string
  new_season?: string
  new_league_id?: string | null
}

export type CourtrackSyncLeagueResult = CourtrackSyncSummary & {
  dry_run: boolean
  league: {
    id: string
    courtrack_id: number
    name: string
    season_label: string
    competition: { id: string; name: string }
  }
  season_event?: CourtrackSeasonEvent
  matches: CourtrackSyncMatch[]
}

/** Sync de una temporada. */
export type CourtrackSyncResult = CourtrackSyncLeagueResult & { quota: CourtrackSyncQuota }

/** Sync de todas las ligas activas (un solo cupo). */
export type CourtrackSyncAllResult = {
  dry_run: boolean
  leagues: CourtrackSyncLeagueResult[]
  totals: CourtrackSyncSummary
  quota: CourtrackSyncQuota
}

export type CourtrackSyncLogEntry = {
  id: string
  league_id: string | null
  status: 'running' | 'success' | 'error' | 'rejected'
  started_at: string
  finished_at: string | null
  summary: CourtrackSyncSummary | null
  /** En un sync de todas las ligas: resumen por liga. */
  leagues?: Record<string, CourtrackSyncSummary>
  error: string | null
}

/** Temporada de una liga de CourtTrack que sigue la organización (fila de courtrack_leagues). */
export type CourtrackLeague = {
  id: string
  competition: Competition
  id_cliente: number
  cliente_name: string | null
  liga_id: number
  liga_name: string
  /** Nombre de la temporada tal como la publicaba CourtTrack (se congela al archivar). */
  season_label: string
  team_name: string
  team_logo_url: string | null
  is_active: boolean
  last_synced_at: string | null
  archived_at: string | null
  archive_reason: 'reset' | 'removed' | null
  /** Hay instantánea de clasificación y fixture guardada. */
  snapshot_at: string | null
}

/** Instantánea de CourtTrack guardada en la temporada (tal cual la devuelve CourtTrack). */
export type CourtrackLeagueSnapshot = {
  id: string
  season_label: string
  snapshot_at: string | null
  /** getPosiciones por etapa: `{ titulo, division, descripcion_etapa, posiciones: [[pos, equipo, pts, pj, pg, pp, ...]] }`. */
  standings: unknown[] | null
  /** findPartidos completo de la liga. */
  fixture: unknown[] | null
}

/** La misma liga tal como la devuelve el servicio, con su último sync. */
export type CourtrackSyncLeague = Omit<CourtrackLeague, 'competition'> & {
  competition: { id: string; name: string; kind: string }
  last_sync: CourtrackSyncLogEntry | null
}

export type CourtrackSyncStatus = {
  org_id: string
  quota: CourtrackSyncQuota
  leagues: CourtrackSyncLeague[]
  last_syncs: CourtrackSyncLogEntry[]
}

export const courtrackSyncInput = z.object({
  /** Temporada a sincronizar (courtrack_leagues.id). Sin ella, todas las ligas activas con un solo cupo. */
  league_id: z.uuid().optional(),
  /** true: calcula qué haría sin escribir nada ni gastar cupo. */
  dry_run: z.boolean().default(false),
})
export type CourtrackSyncInput = z.infer<typeof courtrackSyncInput>

/** Catálogo de CourtTrack para el asistente "Agregar liga". */
export const courtrackCatalogInput = z.discriminatedUnion('resource', [
  z.object({ resource: z.literal('clientes') }),
  z.object({ resource: z.literal('ligas'), id_cliente: z.number().int().positive() }),
  z.object({ resource: z.literal('equipos'), id_cliente: z.number().int().positive(), liga_id: z.number().int().positive() }),
  // El equipo a buscar lo pone el servidor (el equipo propio de la organización), nunca el cliente.
  z.object({ resource: z.literal('descubrir'), id_cliente: z.number().int().positive() }),
])
export type CourtrackCatalogInput = z.infer<typeof courtrackCatalogInput>

const existingCompetition = z.object({ kind: z.literal('existing'), id: z.uuid() })
const newCompetition = z.object({
  kind: z.literal('new'),
  name: z.string().trim().min(1, 'Escribe el nombre de la competición').max(80),
  competition_kind: z.enum(COMPETITION_KINDS),
})

export const leagueCreateInput = z.object({
  id_cliente: z.number().int().positive(),
  cliente_name: z.string().trim().max(120).nullable(),
  liga_id: z.number().int().positive(),
  /** Nombre crudo del equipo propio en esa liga, tal como lo lista /courtrack/equipos. */
  team_name: z.string().trim().min(1, 'Elige tu equipo').max(120),
  competition: z.discriminatedUnion('kind', [existingCompetition, newCompetition]),
})
export type LeagueCreateInput = z.infer<typeof leagueCreateInput>

export const leagueUpdateInput = z.object({
  id: z.uuid(),
  /** Nombre del equipo propio en esa liga, tal como lo lista /courtrack/equipos. */
  team_name: z.string().trim().min(1).max(120),
})
export type LeagueUpdateInput = z.infer<typeof leagueUpdateInput>

export const leagueDeleteInput = z.object({ id: z.uuid() })
export type LeagueDeleteInput = z.infer<typeof leagueDeleteInput>

export const leagueSnapshotInput = z.object({ id: z.uuid() })
export type LeagueSnapshotInput = z.infer<typeof leagueSnapshotInput>

/** Vincula un nombre de CourtTrack a un rival ya cargado (desde la vista previa del sync). */
export const teamLinkCreateInput = z.object({
  courtrack_name: z.string().trim().min(1).max(120),
  team_id: z.uuid(),
})
export type TeamLinkCreateInput = z.infer<typeof teamLinkCreateInput>

// ─── Matches ─────────────────────────────────────────────────────────────────
export const setScoreSchema = z.object({
  us: z.number().int().min(0).max(99),
  them: z.number().int().min(0).max(99),
})
export type SetScore = z.infer<typeof setScoreSchema>

export type MatchSummary = {
  id: string
  slug: string
  played_on: string
  start_time: string | null
  is_home: boolean
  location: string | null
  competition: Competition | null
  phase: string | null
  sets_won: number | null
  sets_lost: number | null
  outcome: MatchOutcome
  cover_image_url: string | null
  opponent: TeamSummary
  video_count: number
}

export type MatchDetail = MatchSummary & {
  set_scores: SetScore[]
  summary: string | null
  videos: Video[]
  /** Id del partido en CourtTrack si vino del sync: habilita la progresión y las estadísticas por set. */
  courtrack_id: string | null
}

// ─── Estadísticas de un partido (CourtTrack, vistas desde el equipo propio) ──
export type MatchSide = 'us' | 'them'
export type MatchStatLine = CourtrackStatLine
export type MatchSetEventKind = CourtrackSetEventKind

/** Paso de la progresión de un set; `us`/`them` es el marcador tras el evento y `team`, quién lo protagoniza. */
export type MatchSetEvent = {
  us: number
  them: number
  team: MatchSide
  kind: MatchSetEventKind
  player: { number: number | null; name: string } | null
  detail: string | null
}

export type MatchSetLineupPlayer = CourtrackSetLineupPlayer

export type MatchSetStats = {
  number: number
  score: SetScore
  duration_minutes: number | null
  timeouts: Record<MatchSide, number>
  substitutions: Record<MatchSide, number>
  stats: Record<MatchSide, MatchStatLine | null>
  /** Formación inicial del equipo propio. */
  lineup: MatchSetLineupPlayer[]
  events: MatchSetEvent[]
}

/** Jugador del equipo propio con sus totales del partido. */
export type MatchPlayerStats = Omit<CourtrackPlayerStats, 'team'>

export type MatchStats = {
  courtrack_id: string
  duration: string | null
  started_at: string | null
  ended_at: string | null
  mvp: { name: string; number: number | null; team: MatchSide } | null
  sets: MatchSetStats[]
  totals: Record<MatchSide, MatchStatLine | null>
  players: MatchPlayerStats[]
}

export const matchListQuery = z.object({
  // Solo partidos jugados antes de esta fecha (incluida). Por defecto, hoy.
  until: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Solo partidos de estas competiciones (filtro por liga): uno o varios ids separados por coma.
  competition_id: z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(20))
    .optional(),
  // Solo partidos de esta temporada de CourtTrack (courtrack_leagues.id).
  courtrack_league_id: z.uuid().optional(),
})

// ─── Escritura desde el dashboard (/api/admin/*) ─────────────────────────────
// La palabra clave viaja en la cabecera ADMIN_SAFEWORD_HEADER (shared/domain.ts).

/** Texto opcional: recorta espacios y convierte la cadena vacía en null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export const newTeamInput = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del equipo').max(80),
  short_name: optionalText(4).transform((value) => value?.toUpperCase() ?? null),
  logo_url: optionalText(2048).refine((value) => value === null || isHttpUrl(value), 'La URL del logo no es válida'),
})
export type NewTeamInput = z.infer<typeof newTeamInput>

const noOpponent = z.object({ kind: z.literal('none') })
const existingOpponent = z.object({ kind: z.literal('existing'), team_id: z.uuid() })
const newOpponent = z.object({ kind: z.literal('new'), team: newTeamInput })
/** Rival: ninguno (solo actividades), uno existente o uno nuevo que se crea al guardar. */
export type OpponentInput = z.infer<typeof noOpponent | typeof existingOpponent | typeof newOpponent>

/** "HH:MM" en 24 horas. */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida')

export const activityCreateInput = z.object({
  title: z.string().trim().min(1, 'Escribe un título').max(120),
  description: optionalText(2000),
  activity_date: isoDate,
  start_time: timeOfDay,
  category: z.enum(ACTIVITY_CATEGORIES),
  opponent: z.discriminatedUnion('kind', [noOpponent, existingOpponent, newOpponent]),
  location: optionalText(120),
})
export type ActivityCreateInput = z.infer<typeof activityCreateInput>

/** Edición de una actividad: los mismos campos que el alta. */
export const activityUpdateInput = activityCreateInput.extend({ id: z.uuid() })
export type ActivityUpdateInput = z.infer<typeof activityUpdateInput>

export const activityDeleteInput = z.object({ id: z.uuid() })
export type ActivityDeleteInput = z.infer<typeof activityDeleteInput>

export const matchCreateInput = z.object({
  opponent: z.discriminatedUnion('kind', [existingOpponent, newOpponent]),
  played_on: isoDate,
  start_time: timeOfDay.nullable(),
  location: optionalText(120),
  competition_id: z.uuid('Elige la competición'),
  phase: optionalText(60),
  set_scores: z
    .array(setScoreSchema.refine((set) => set.us !== set.them, 'Un set no puede terminar empatado'))
    .min(1, 'Carga al menos un set')
    .max(MAX_SETS),
})
export type MatchCreateInput = z.infer<typeof matchCreateInput>

export type MatchCreated = { id: string; slug: string; opponent: TeamSummary }

/** Edición de un partido: los mismos campos que el alta. El slug (y la carpeta del bucket) no cambian. */
export const matchUpdateInput = matchCreateInput.extend({ id: z.uuid() })
export type MatchUpdateInput = z.infer<typeof matchUpdateInput>

export const matchDeleteInput = z.object({ id: z.uuid() })
export type MatchDeleteInput = z.infer<typeof matchDeleteInput>

export const videoUpdateInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, 'Ponle un título al video').max(120),
  set_number: z.number().int().min(1).max(MAX_SETS).nullable(),
})
export type VideoUpdateInput = z.infer<typeof videoUpdateInput>

export const videoDeleteInput = z.object({ id: z.uuid() })
export type VideoDeleteInput = z.infer<typeof videoDeleteInput>

const videoFileName = z.string().trim().min(1).max(200)

export const uploadStartInput = z.object({
  match_id: z.uuid(),
  file_name: videoFileName,
  content_type: z.string().max(100).nullable(),
  size_bytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
})
export type UploadStartInput = z.infer<typeof uploadStartInput>

/** Subida multiparte: el navegador envía cada trozo directo al bucket con su URL firmada. */
export type UploadStart = {
  key: string
  upload_id: string
  part_size: number
  parts: { part_number: number; url: string }[]
  expires_at: string
}

const uploadRef = {
  match_id: z.uuid(),
  key: z.string().min(1).max(1024),
  upload_id: z.string().min(1).max(1024),
}

export const uploadCompleteInput = z.object({
  ...uploadRef,
  parts: z
    .array(z.object({ part_number: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }))
    .min(1)
    .max(10_000),
  title: z.string().trim().min(1).max(120),
  set_number: z.number().int().min(1).max(MAX_SETS).nullable(),
  sort_order: z.number().int().min(0).max(1000),
})
export type UploadCompleteInput = z.infer<typeof uploadCompleteInput>

export const uploadAbortInput = z.object(uploadRef)
export type UploadAbortInput = z.infer<typeof uploadAbortInput>

// ─── Plantel y formaciones (Alineación) ─────────────────────────────────────
export type Player = {
  id: string
  name: string
  jersey_number: number | null
  primary_position: PlayerPosition
  secondary_position: PlayerPosition | null
  is_active: boolean
}

/** Jugador en cancha: coordenadas normalizadas (0..1) sobre la media cancha, con la red en y = 0. */
export type LineupSlot = { player_id: string; x: number; y: number }

export type Lineup = {
  id: string
  name: string
  notes: string | null
  slots: LineupSlot[]
  updated_at: string
}

const positionsDiffer = (input: { primary_position: PlayerPosition; secondary_position: PlayerPosition | null }) =>
  input.primary_position !== input.secondary_position

const positionsDifferIssue = {
  message: 'La posición secundaria tiene que ser distinta de la principal',
  path: ['secondary_position'],
}

const playerFields = {
  name: z.string().trim().min(1, 'Escribe el nombre del jugador').max(PLAYER_NAME_MAX),
  jersey_number: z.number().int().min(0).max(99).nullish().transform((value) => value ?? null),
  primary_position: z.enum(PLAYER_POSITIONS, 'Elige la posición principal'),
  secondary_position: z.enum(PLAYER_POSITIONS).nullish().transform((value) => value ?? null),
}

export const playerCreateInput = z.object(playerFields).refine(positionsDiffer, positionsDifferIssue)
export type PlayerCreateInput = z.infer<typeof playerCreateInput>

export const playerUpdateInput = z
  .object({ ...playerFields, id: z.uuid(), is_active: z.boolean() })
  .refine(positionsDiffer, positionsDifferIssue)
export type PlayerUpdateInput = z.infer<typeof playerUpdateInput>

export const playerDeleteInput = z.object({ id: z.uuid() })
export type PlayerDeleteInput = z.infer<typeof playerDeleteInput>

const coordinate = z.number().min(0).max(1)

/** Sin `id` crea la formación; con `id` reemplaza su nombre, notas y jugadores. */
export const lineupSaveInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Escribe un nombre para la formación').max(LINEUP_NAME_MAX),
  notes: optionalText(LINEUP_NOTES_MAX),
  slots: z
    .array(z.object({ player_id: z.uuid(), x: coordinate, y: coordinate }))
    .max(LINEUP_MAX_SLOTS, `Como máximo ${LINEUP_MAX_SLOTS} jugadores en cancha`)
    .refine(
      (slots) => new Set(slots.map((slot) => slot.player_id)).size === slots.length,
      'Un jugador no puede estar dos veces en cancha',
    ),
})
export type LineupSaveInput = z.infer<typeof lineupSaveInput>

export const lineupDeleteInput = z.object({ id: z.uuid() })
export type LineupDeleteInput = z.infer<typeof lineupDeleteInput>

// ─── Errores ─────────────────────────────────────────────────────────────────
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
}

// ─── Rutas ───────────────────────────────────────────────────────────────────
/** Mismo formato que el CHECK `matches_slug_format` de la migración. */
export const matchSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
