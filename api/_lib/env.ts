// Variables de entorno del servidor. Se leen en diferido para que un fallo de
// configuración devuelva un 500 claro en vez de romper el arranque de la función.

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL')
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY')
  },
  get s3() {
    return {
      endpoint: optional('S3_ENDPOINT'),
      region: optional('S3_REGION') ?? 'auto',
      bucket: required('S3_BUCKET'),
      accessKeyId: required('S3_ACCESS_KEY_ID'),
      secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
      videoPrefix: optional('S3_VIDEO_PREFIX') ?? '',
      publicBaseUrl: optional('STORAGE_PUBLIC_BASE_URL'),
      signedUrlTtlSeconds: Number(optional('SIGNED_URL_TTL_SECONDS') ?? 3600),
    }
  },
  /** Palabra clave para cargar datos desde el dashboard. Sin ella, /api/admin/* queda cerrado. */
  get adminSafeword() {
    return optional('ADMIN_SAFEWORD')
  },
  /** Palabra clave de la sección Flyers (subir o borrar en el bucket y usar la IA). Sin ella, esas acciones dan 503. */
  get flyersSafeword() {
    return optional('FLYERS_SAFEWORD')
  },
  get cronSecret() {
    return optional('CRON_SECRET')
  },
  /** Organización dueña de los datos (competiciones, ligas de CourtTrack, cupo de syncs). Un solo equipo por deploy hoy. */
  get orgId() {
    return required('ORG_ID')
  },
  /**
   * Descripción libre del equipo para el asistente de flyers (deporte, ciudad, mascota, colores, tono).
   * El nombre sale de la tabla teams (is_own_team).
   */
  get teamProfile() {
    return optional('TEAM_PROFILE')
  },
  /** Microservicio courtrack-service (repo aparte). Sin URL o token, /api/admin/courtrack-* responde 503. */
  get courtrackSync() {
    return {
      url: optional('COURTRACK_SYNC_URL')?.replace(/\/+$/, ''),
      secret: optional('COURTRACK_SYNC_SECRET'),
    }
  },
  /** Asistente de flyers. Sin clave, /api/flyers/suggest responde 503. */
  get openrouter() {
    return {
      apiKey: optional('OPENROUTER_API_KEY'),
      // Lista separada por comas: el primero es el principal y el resto, respaldo si falla (OpenRouter `models`).
      // `openrouter/free` enruta a un modelo gratuito disponible: sobrevive a que retiren uno concreto.
      models: (optional('OPENROUTER_MODEL') ?? 'openrouter/free').split(',').map((m) => m.trim()).filter(Boolean),
    }
  },
}
