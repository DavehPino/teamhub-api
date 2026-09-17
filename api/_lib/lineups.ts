// Acceso a datos de las formaciones (Alineación). Los jugadores en cancha de cada una viven en lineup_players.
import { lineupLimitMessage, lineupRoleOf, type PlayerPosition } from '../../shared/domain.js'
import type { Lineup, LineupDeleteInput, LineupSaveInput, LineupSlot } from '../../shared/schemas.js'
import { badRequest, conflict, notFound } from './http.js'
import { LINEUP_SELECT, PLAYER_SELECT, toLineup, toPlayer } from './mappers.js'
import { db } from './supabase.js'

const UNIQUE_VIOLATION = '23505'

/** Todas las formaciones con sus jugadores, la editada más recientemente primero. */
export async function listLineups(): Promise<Lineup[]> {
  const { data, error } = await db().from('lineups').select(LINEUP_SELECT).order('updated_at', { ascending: false })
  if (error) throw error
  return data.map(toLineup)
}

async function getLineup(id: string): Promise<Lineup> {
  const { data, error } = await db().from('lineups').select(LINEUP_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw notFound('Formación no encontrada')
  return toLineup(data)
}

/** Mismas reglas que la cancha: jugadores existentes y activos, 6 titulares y 1 líbero como máximo. */
async function assertValidSlots(slots: LineupSlot[]): Promise<void> {
  if (slots.length === 0) return
  const ids = slots.map((slot) => slot.player_id)
  const { data, error } = await db().from('players').select(PLAYER_SELECT).in('id', ids)
  if (error) throw error
  const players = new Map(data.map((row) => [row.id, toPlayer(row)]))

  const onCourt: PlayerPosition[] = []
  for (const slot of slots) {
    const player = players.get(slot.player_id)
    if (!player) throw badRequest('Un jugador de la formación ya no existe. Recarga la página.')
    if (!player.is_active) throw badRequest(`${player.name} está inactivo y no puede estar en cancha`)
    const limit = lineupLimitMessage(lineupRoleOf(player.primary_position), onCourt)
    if (limit) throw badRequest(limit)
    onCourt.push(player.primary_position)
  }
}

const nameConflict = (name: string) => conflict(`Ya hay una formación llamada "${name}"`)

async function insertSlots(lineupId: string, slots: LineupSlot[]): Promise<void> {
  if (slots.length === 0) return
  const { error } = await db()
    .from('lineup_players')
    .insert(slots.map((slot) => ({ lineup_id: lineupId, player_id: slot.player_id, x: slot.x, y: slot.y })))
  if (error) throw error
}

async function createLineup(input: LineupSaveInput): Promise<Lineup> {
  const { data, error } = await db()
    .from('lineups')
    .insert({ name: input.name, notes: input.notes })
    .select('id')
    .single()
  if (error?.code === UNIQUE_VIOLATION) throw nameConflict(input.name)
  if (error) throw error

  try {
    await insertSlots(data.id, input.slots)
  } catch (err) {
    // Sin transacciones en el cliente: no se deja una formación creada sin sus jugadores.
    await db().from('lineups').delete().eq('id', data.id)
    throw err
  }
  return getLineup(data.id)
}

async function replaceLineup(id: string, input: LineupSaveInput): Promise<Lineup> {
  const previous = await getLineup(id)

  const { error } = await db().from('lineups').update({ name: input.name, notes: input.notes }).eq('id', id)
  if (error?.code === UNIQUE_VIOLATION) throw nameConflict(input.name)
  if (error) throw error

  const { error: deleteError } = await db().from('lineup_players').delete().eq('lineup_id', id)
  if (deleteError) throw deleteError
  try {
    await insertSlots(id, input.slots)
  } catch (err) {
    // Se restauran los jugadores que tenía para no dejar la formación vacía.
    await insertSlots(id, previous.slots).catch(() => undefined)
    throw err
  }
  return getLineup(id)
}

/** Sin id crea la formación; con id reemplaza nombre, notas y todos sus jugadores en cancha. */
export async function saveLineup(input: LineupSaveInput): Promise<Lineup> {
  await assertValidSlots(input.slots)
  return input.id ? replaceLineup(input.id, input) : createLineup(input)
}

export async function deleteLineup(input: LineupDeleteInput): Promise<void> {
  const { data, error } = await db().from('lineups').delete().eq('id', input.id).select('id')
  if (error) throw error
  if (data.length === 0) throw notFound('Formación no encontrada')
}
