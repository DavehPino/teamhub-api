// Vocabulario compartido entre frontend y backend.
// Debe coincidir con los CHECK constraints de supabase/migrations.

export const ACTIVITY_TYPES = [
  "entrenamiento",
  "partido",
  "amistoso",
  "torneo",
  "fisico",
  "video_analisis",
  "reunion",
  "otro",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  entrenamiento: "Entrenamiento",
  partido: "Partido",
  amistoso: "Amistoso",
  torneo: "Torneo",
  fisico: "Preparación física",
  video_analisis: "Análisis de video",
  reunion: "Reunión",
  otro: "Otro",
};

/** Categoría de la actividad: las de Liga Podio se destacan y van primero en el carrusel. */
export const ACTIVITY_CATEGORIES = ["general", "podio"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  general: "General",
  podio: "Liga Podio",
};

export const VIDEO_CATEGORIES = [
  "partido",
  "entrenamiento",
  "scouting",
  "highlights",
  "tecnica",
  "tactica",
  "sin_clasificar",
] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

export const VIDEO_CATEGORY_LABELS: Record<VideoCategory, string> = {
  partido: "Partido",
  entrenamiento: "Entrenamiento",
  scouting: "Scouting rival",
  highlights: "Highlights",
  tecnica: "Técnica",
  tactica: "Táctica",
  sin_clasificar: "Sin clasificar",
};

export const VIDEO_SOURCES = ["bucket", "external"] as const;
export type VideoSource = (typeof VIDEO_SOURCES)[number];

export const VIDEO_STATUSES = ["pending", "ready", "archived"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export type MatchOutcome = "win" | "loss" | "pending";

/** Carpeta del bucket cuyos subdirectorios son slugs de partido: games/<slug>/archivo.mp4 */
export const MATCH_VIDEOS_FOLDER = "games";

export const VIDEO_FILE_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
] as const;

/** Tipo de competición (tabla competitions). Debe coincidir con el CHECK `competitions_kind_check`. */
export const COMPETITION_KINDS = ["league", "friendly", "tournament", "other"] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

export const COMPETITION_KIND_LABELS: Record<CompetitionKind, string> = {
  league: "Liga",
  friendly: "Amistoso",
  tournament: "Torneo",
  other: "Otra",
};

/** Un partido de vóley tiene como máximo 5 sets (igual que `videos.set_number`). */
export const MAX_SETS = 5;

/** Tamaño máximo de un video subido desde el dashboard (10 GiB, el plan gratuito de R2). */
export const MAX_VIDEO_BYTES = 10 * 1024 ** 3;

/** Cabecera con la palabra clave de carga, codificada con encodeURIComponent (admite tildes y ñ). */
export const ADMIN_SAFEWORD_HEADER = "x-admin-safeword";

/** Cabecera con la palabra clave de la sección Flyers (FLYERS_SAFEWORD), distinta de la de carga. */
export const FLYERS_SAFEWORD_HEADER = "x-flyers-safeword";

/** Posición de un jugador (tabla players). Debe coincidir con los CHECK `players_*_position_check`. */
export const PLAYER_POSITIONS = [
  "armador",
  "punta",
  "central",
  "opuesto",
  "libero",
  "comodin",
] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  armador: "Armador",
  punta: "Punta",
  central: "Central",
  opuesto: "Opuesto",
  libero: "Líbero",
  comodin: "Comodín",
};

/** Abreviatura de 3 letras: el color nunca es la única pista. */
export const PLAYER_POSITION_SHORT: Record<PlayerPosition, string> = {
  armador: "ARM",
  punta: "PUN",
  central: "CEN",
  opuesto: "OPU",
  libero: "LÍB",
  comodin: "COM",
};

/** Posición que ocupa la plaza de líbero en cancha (si es la principal del jugador). */
export const LIBERO_POSITION: PlayerPosition = "libero";

/** Jugadores en cancha: 6 titulares + 1 líbero. */
export const LINEUP_MAX_STARTERS = 6;
export const LINEUP_MAX_LIBEROS = 1;
export const LINEUP_MAX_SLOTS = LINEUP_MAX_STARTERS + LINEUP_MAX_LIBEROS;

export const PLAYER_NAME_MAX = 60;
export const LINEUP_NAME_MAX = 40;
export const LINEUP_NOTES_MAX = 500;

/** Plaza que ocupa un jugador en cancha según su posición principal. */
export type LineupRole = "starter" | "libero";

export function lineupRoleOf(primaryPosition: PlayerPosition): LineupRole {
  return primaryPosition === LIBERO_POSITION ? "libero" : "starter";
}

/**
 * Por qué no cabe un jugador más en cancha, o null si cabe. Lo usan la cancha (al soltar una ficha)
 * y el backend (al guardar), para que ambos apliquen la misma regla.
 */
export function lineupLimitMessage(role: LineupRole, onCourt: readonly PlayerPosition[]): string | null {
  const taken = onCourt.filter((position) => lineupRoleOf(position) === role).length;
  if (role === "libero" && taken >= LINEUP_MAX_LIBEROS) return "Ya hay un líbero en cancha";
  if (role === "starter" && taken >= LINEUP_MAX_STARTERS) return `Ya hay ${LINEUP_MAX_STARTERS} titulares`;
  return null;
}
