// Acceso a datos de actividades. Único punto de entrada: cuando llegue la autenticación,
// las reglas de acceso se aplican aquí sin tocar las rutas.
import { addDays, todayIsoDate } from '../../shared/dates.js'
import type {
  Activity,
  ActivityCreateInput,
  ActivityDeleteInput,
  ActivityUpdateInput,
} from '../../shared/schemas.js'
import { badRequest, notFound } from './http.js'
import { TEAM_SUMMARY_SELECT, toActivity } from './mappers.js'
import { db } from './supabase.js'
import { discardCreatedTeam, resolveOpponent } from './teams.js'

/** Actividades no canceladas desde `from` (incluido), de la más próxima a la más lejana. */
export async function listUpcomingActivities(from: string, limit: number): Promise<Activity[]> {
  const { data, error } = await db()
    .from('weekly_activities')
    .select(`*, opponent:teams!weekly_activities_opponent_team_id_fkey(${TEAM_SUMMARY_SELECT})`)
    .gte('activity_date', from)
    .eq('is_cancelled', false)
    .order('activity_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .limit(limit)
  if (error) throw error

  return data.map(({ opponent, ...row }) => toActivity(row, opponent))
}

/** Solo actividades futuras. Tolerancia de un día: el reloj del servidor puede ir por delante de la hora local del equipo. */
function assertUpcoming(activityDate: string): void {
  if (activityDate < addDays(todayIsoDate(), -1)) throw badRequest('La fecha de la actividad ya pasó')
}

/**
 * Crea una actividad futura y, si se pide, su rival. El formulario no tiene tipo ni hora de fin:
 * se guardan como 'otro' y null. Si la actividad no se guarda, el rival recién creado se borra.
 */
export async function createActivity(input: ActivityCreateInput): Promise<Activity> {
  assertUpcoming(input.activity_date)

  const resolved = await resolveOpponent(input.opponent)
  const { data, error } = await db()
    .from('weekly_activities')
    .insert({
      title: input.title,
      description: input.description,
      activity_date: input.activity_date,
      start_time: input.start_time,
      end_time: null,
      location: input.location,
      category: input.category,
      opponent_team_id: resolved.team?.id ?? null,
      activity_type: 'otro',
      is_cancelled: false,
    })
    .select('*')
    .single()
  if (error) {
    await discardCreatedTeam(resolved)
    throw error
  }
  return toActivity(data, resolved.team)
}

/**
 * Edita una actividad con los campos del formulario. El tipo no se toca y la hora de fin (de las cargadas a mano)
 * se conserva solo si sigue siendo posterior a la de inicio. Si falla, el rival recién creado se borra.
 */
export async function updateActivity(input: ActivityUpdateInput): Promise<Activity> {
  assertUpcoming(input.activity_date)
  const { data: current, error: currentError } = await db()
    .from('weekly_activities')
    .select('id,end_time')
    .eq('id', input.id)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current) throw notFound('Actividad no encontrada')

  // "HH:MM:SS" frente a "HH:MM": se comparan como texto con los segundos a cero.
  const endTime = current.end_time && current.end_time > `${input.start_time}:00` ? current.end_time : null

  const resolved = await resolveOpponent(input.opponent)
  const { data, error } = await db()
    .from('weekly_activities')
    .update({
      title: input.title,
      description: input.description,
      activity_date: input.activity_date,
      start_time: input.start_time,
      end_time: endTime,
      location: input.location,
      category: input.category,
      opponent_team_id: resolved.team?.id ?? null,
    })
    .eq('id', input.id)
    .select('*')
    .single()
  if (error) {
    await discardCreatedTeam(resolved)
    throw error
  }
  return toActivity(data, resolved.team)
}

/** Borra la actividad. Los partidos y videos que la referencian quedan sin actividad (on delete set null). */
export async function deleteActivity(input: ActivityDeleteInput): Promise<void> {
  const { data, error } = await db().from('weekly_activities').delete().eq('id', input.id).select('id')
  if (error) throw error
  if (data.length === 0) throw notFound('Actividad no encontrada')
}
