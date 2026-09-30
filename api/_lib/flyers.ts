// Asistente de flyers: pide a un modelo de OpenRouter una nueva versión del flyer a partir del actual,
// el pedido del usuario y las próximas actividades del equipo. El modelo solo devuelve textos y
// opciones de diseño (plantilla, paleta, formato); el dibujo se hace en el navegador.
import { shortTime } from '../../shared/dates.js'
import { ACTIVITY_CATEGORY_LABELS } from '../../shared/domain.js'
import {
  FLYER_FORMATS,
  FLYER_MAX_LOGOS,
  FLYER_PALETTES,
  FLYER_PALETTE_LABELS,
  FLYER_TEMPLATES,
  FLYER_TEMPLATE_LABELS,
  FLYER_TEXT_FIELDS,
  FLYER_TEXT_LIMITS,
  type FlyerAssetRef,
  type FlyerContent,
  type FlyerSuggestInput,
  type FlyerSuggestion,
} from '../../shared/flyers.js'
import type { Activity } from '../../shared/schemas.js'
import { listUpcomingActivities } from './activities.js'
import { env } from './env.js'
import { HttpError } from './http.js'
import { getOwnTeam } from './teams.js'
import type { Org } from './tenant.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/** Los modelos gratuitos pueden tardar: margen amplio, por debajo del maxDuration de la función (vercel.json). */
const TIMEOUT_MS = 50_000
/** Reintentos cuando OpenRouter contesta 200 con un cuerpo vacío o cortado (proveedor gratuito caído a medias). */
const TRUNCATED_RETRIES = 1
/** No merece la pena reintentar si queda menos tiempo que esto antes del límite. */
const MIN_RETRY_BUDGET_MS = 10_000
const CONTEXT_ACTIVITIES = 8

const FIELD_GUIDE: Record<(typeof FLYER_TEXT_FIELDS)[number], string> = {
  eyebrow: 'etiqueta pequeña sobre el título (competencia, fecha de liga, tipo de evento)',
  title: 'título principal, muy corto y con fuerza (2-4 palabras)',
  subtitle: 'línea secundaria (p.ej. "Local vs Rival")',
  highlight: 'dato gigante: marcador ("3-1"), "VS", un número o una palabra',
  date: 'fecha legible (p.ej. "Sábado 20/09")',
  time: 'hora (p.ej. "18:00 hs")',
  location: 'lugar (club, dirección o barrio)',
  details: 'texto breve de apoyo, 1-2 frases',
  cta: 'llamada a la acción corta (p.ej. "¡Vení a alentar!")',
}

const TEMPLATE_GUIDE: Record<(typeof FLYER_TEMPLATES)[number], string> = {
  partido: 'anuncio de un partido: title, subtitle (rival), highlight ("VS"), opponentLogo, date, time, location, cta',
  entrenamiento: 'entrenamiento o práctica: title, subtitle, date, time, location, details, cta',
  resultado: 'resultado de un partido jugado: eyebrow, title ("¡Victoria!"), highlight (marcador), opponentLogo, subtitle, details (parciales), cta',
  anuncio: 'anuncio general, convocatoria o evento: eyebrow, title, subtitle, details, date, location, cta',
}

function systemPrompt(teamName: string, teamProfile: string | undefined): string {
  const fields = FLYER_TEXT_FIELDS.map((f) => `- ${f} (máx. ${FLYER_TEXT_LIMITS[f]} caracteres): ${FIELD_GUIDE[f]}`)
  const templates = FLYER_TEMPLATES.map((t) => `- ${t} (${FLYER_TEMPLATE_LABELS[t]}): ${TEMPLATE_GUIDE[t]}`)
  const palettes = FLYER_PALETTES.map((p) => `- ${p} (${FLYER_PALETTE_LABELS[p]})`)
  return [
    `Eres el diseñador de redes sociales de ${teamName}.`,
    ...(teamProfile ? [teamProfile] : []),
    'El logo del equipo va en los flyers.',
    'Tu trabajo es redactar y ajustar flyers para Instagram según lo que pida el usuario.',
    '',
    'Reglas:',
    '- Escribe en español, con energía deportiva y sin exagerar. Si el perfil del equipo indica un tono o variante regional, respétalo.',
    '- Textos cortos: un flyer se lee en 2 segundos. Respeta los límites de caracteres.',
    '- Parte del flyer actual y cambia solo lo que pida el usuario o lo que haga falta para que sea coherente.',
    '- Si el pedido menciona una actividad del equipo, usa sus datos reales (fecha, hora, lugar, rival).',
    '- No inventes datos concretos (fechas, horas, lugares, marcadores) que no estén en el pedido, el flyer o las actividades: deja el campo vacío.',
    '- Campos que la plantilla no usa: déjalos vacíos.',
    '- Usa emojis como mucho uno por campo y solo en cta o details.',
    '',
    'Campos de texto:',
    ...fields,
    '',
    'Plantillas (template):',
    ...templates,
    '',
    'Paletas (palette): "podio" solo para actividades de Liga Podio; "brasa" es la paleta por defecto.',
    ...palettes,
    '',
    `Formatos (format): ${FLYER_FORMATS.join(', ')} (post 4:5, cuadrado, historia 9:16). No lo cambies salvo que te lo pidan.`,
    'showLogo: true salvo que pidan quitar el logo.',
    '',
    'Imágenes: el usuario puede subir imágenes (logos de rivales, auspiciantes, ligas). Recibes su id y el nombre que les puso.',
    '- opponentLogo: id de la imagen del rival en partido y resultado (se dibuja junto al logo del equipo). Usa una solo si su nombre corresponde al rival; si no, "".',
    `- logos: lista de ids (máx. ${FLYER_MAX_LOGOS}) que se muestran en una fila (auspiciantes, liga, organizadores). Solo si el pedido lo sugiere o encajan claramente.`,
    '- Usa únicamente ids de la lista de imágenes disponibles. No repitas en logos la imagen de opponentLogo.',
    '',
    'Responde SOLO con un objeto JSON, sin texto alrededor ni bloques de código:',
    '{"message": "qué cambiaste, en una frase", "flyer": { ...todos los campos del flyer... }}',
  ].join('\n')
}

function describeActivity(activity: Activity): string {
  const parts = [activity.activity_date, shortTime(activity.start_time), activity.title]
  if (activity.opponent) parts.push(`vs ${activity.opponent.name}`)
  if (activity.location) parts.push(`en ${activity.location}`)
  parts.push(ACTIVITY_CATEGORY_LABELS[activity.category])
  if (activity.description) parts.push(activity.description)
  return `- ${parts.filter(Boolean).join(' · ')}`
}

async function upcomingContext(org: Org, today: string): Promise<string> {
  try {
    const activities = await listUpcomingActivities(org, today, CONTEXT_ACTIVITIES)
    return activities.length > 0 ? activities.map(describeActivity).join('\n') : '(no hay actividades cargadas)'
  } catch (err) {
    // Sin base de datos el asistente sigue funcionando, solo que sin contexto.
    console.error(err)
    return '(no se pudieron consultar)'
  }
}

function describeAssets(assets: FlyerAssetRef[]): string {
  return assets.length > 0 ? assets.map((asset) => `- ${asset.id}: ${JSON.stringify(asset.name)}`).join('\n') : '(ninguna)'
}

function userPrompt(input: FlyerSuggestInput, activities: string): string {
  return [
    `Hoy es ${input.today}.`,
    '',
    'Próximas actividades del equipo:',
    activities,
    '',
    'Imágenes disponibles:',
    describeAssets(input.assets),
    '',
    'Flyer actual (JSON):',
    JSON.stringify(input.flyer),
    '',
    'Pedido del usuario:',
    input.prompt,
  ].join('\n')
}

/** Extrae el primer objeto JSON de la respuesta: algunos modelos lo envuelven en texto o en ```json. */
function extractJson(content: string): unknown {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function pick<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * Los modelos gratuitos no siempre respetan el formato: cada campo válido se toma, los textos se
 * recortan a su límite y lo que falte o no encaje conserva el valor del flyer actual.
 */
function normalizeFlyer(raw: unknown, current: FlyerContent, assets: FlyerAssetRef[]): FlyerContent {
  const source = isRecord(raw) ? raw : {}
  const known = new Set(assets.map((asset) => asset.id))
  const flyer: FlyerContent = {
    ...current,
    template: pick(FLYER_TEMPLATES, source.template, current.template),
    palette: pick(FLYER_PALETTES, source.palette, current.palette),
    format: pick(FLYER_FORMATS, source.format, current.format),
    showLogo: typeof source.showLogo === 'boolean' ? source.showLogo : current.showLogo,
  }
  for (const field of FLYER_TEXT_FIELDS) {
    const value = source[field]
    if (typeof value === 'string') flyer[field] = value.trim().slice(0, FLYER_TEXT_LIMITS[field])
  }
  // Solo ids de imágenes que el usuario tiene: un id inventado dejaría un hueco vacío en el flyer.
  if (source.opponentLogo === '' || source.opponentLogo === null) flyer.opponentLogo = ''
  else if (typeof source.opponentLogo === 'string' && known.has(source.opponentLogo)) flyer.opponentLogo = source.opponentLogo
  if (Array.isArray(source.logos)) {
    const ids = source.logos.filter((id): id is string => typeof id === 'string' && known.has(id) && id !== flyer.opponentLogo)
    flyer.logos = [...new Set(ids)].slice(0, FLYER_MAX_LOGOS)
  }
  return flyer
}

type ChatCompletion = {
  model?: string
  choices?: { message?: { content?: string | null } }[]
  error?: { message?: string; code?: number }
}

type RawResponse = { status: number; ok: boolean; contentType: string | null; body: string }

/** Recorte del cuerpo para los logs: suficiente para reconocer HTML, relleno o un JSON cortado. */
function snippet(body: string): string {
  return JSON.stringify(body.trim().slice(0, 300))
}

function parseCompletion(body: string): ChatCompletion | null {
  try {
    const value: unknown = JSON.parse(body)
    return isRecord(value) ? (value as ChatCompletion) : null
  } catch {
    return null
  }
}

/** Una petición a OpenRouter con presupuesto de tiempo que cubre también la lectura del cuerpo. */
async function requestCompletion(apiKey: string, models: string[], system: string, user: string, budgetMs: number): Promise<RawResponse> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(budgetMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'teamhub-api',
      },
      body: JSON.stringify({
        model: models[0],
        ...(models.length > 1 ? { models } : {}),
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type'), body: await res.text() }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new HttpError(504, 'ai_timeout', 'El asistente tardó demasiado en responder. Inténtalo de nuevo.')
    }
    console.error('OpenRouter inalcanzable', err)
    throw new HttpError(502, 'ai_unavailable', 'No se pudo contactar con el asistente de IA.')
  }
}

async function callOpenRouter(apiKey: string, models: string[], system: string, user: string): Promise<ChatCompletion> {
  const deadline = Date.now() + TIMEOUT_MS
  for (let attempt = 0; ; attempt++) {
    const res = await requestCompletion(apiKey, models, system, user, Math.max(1_000, deadline - Date.now()))
    const data = parseCompletion(res.body)
    if (res.status === 429) {
      throw new HttpError(429, 'ai_rate_limited', 'Se alcanzó el límite gratuito del asistente. Espera un momento y reintenta.')
    }
    if (res.status === 401 || res.status === 403) {
      console.error('OpenRouter rechazó la clave', data?.error ?? snippet(res.body))
      throw new HttpError(503, 'ai_disabled', 'La clave de OpenRouter no es válida (OPENROUTER_API_KEY).')
    }
    if (!res.ok) {
      console.error('OpenRouter', res.status, data?.error ?? snippet(res.body))
      throw new HttpError(502, 'ai_error', data?.error?.message ?? 'El asistente de IA devolvió un error.')
    }
    if (data?.choices?.length) return data
    // OpenRouter manda el 200 y espacios de keep-alive mientras el modelo trabaja; si el proveedor
    // falla después, el cuerpo llega vacío, cortado o con un {"error"} pese al 200.
    const reason = data?.error ? `error con 200: ${JSON.stringify(data.error)}` : `sin JSON (${res.contentType}, ${res.body.length} bytes): ${snippet(res.body)}`
    console.error(`OpenRouter ${models.join(',')} intento ${attempt + 1}: ${reason}`)
    if (attempt < TRUNCATED_RETRIES && deadline - Date.now() > MIN_RETRY_BUDGET_MS) continue
    throw new HttpError(502, 'ai_error', data?.error?.message ?? 'El asistente devolvió una respuesta incompleta. Inténtalo de nuevo.')
  }
}

export async function suggestFlyer(org: Org, input: FlyerSuggestInput): Promise<FlyerSuggestion> {
  const { apiKey, models } = env.openrouter
  if (!apiKey) {
    throw new HttpError(503, 'ai_disabled', 'El asistente no está configurado en el servidor (falta OPENROUTER_API_KEY).')
  }

  const [activities, team] = await Promise.all([upcomingContext(org, input.today), getOwnTeam(org)])
  // TEAM_PROFILE describe al equipo de la organización por defecto: no se aplica a las demás.
  const teamProfile = org.isDefault ? env.teamProfile : undefined
  const completion = await callOpenRouter(apiKey, models, systemPrompt(team.name, teamProfile), userPrompt(input, activities))
  const parsed = extractJson(completion.choices?.[0]?.message?.content ?? '')
  if (!isRecord(parsed)) {
    throw new HttpError(502, 'ai_invalid', 'El asistente respondió en un formato inesperado. Prueba de nuevo o reformula el pedido.')
  }

  const message = typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : 'Listo, actualicé el flyer.'
  return {
    flyer: normalizeFlyer(isRecord(parsed.flyer) ? parsed.flyer : parsed, input.flyer, input.assets),
    message: message.slice(0, 300),
    model: completion.model ?? models[0],
  }
}
