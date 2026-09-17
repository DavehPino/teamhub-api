// Acceso a datos del plantel (Alineación).
import type { Player, PlayerCreateInput, PlayerDeleteInput, PlayerUpdateInput } from '../../shared/schemas.js'
import { conflict, notFound } from './http.js'
import { PLAYER_SELECT, toPlayer } from './mappers.js'
import { db } from './supabase.js'

const UNIQUE_VIOLATION = '23505'

/** Activos primero; dentro de cada grupo, por número (sin número al final) y nombre. */
function comparePlayers(a: Player, b: Player): number {
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
  const numberA = a.jersey_number ?? Number.POSITIVE_INFINITY
  const numberB = b.jersey_number ?? Number.POSITIVE_INFINITY
  if (numberA !== numberB) return numberA - numberB
  return a.name.localeCompare(b.name, 'es')
}

export async function listPlayers(): Promise<Player[]> {
  const { data, error } = await db().from('players').select(PLAYER_SELECT)
  if (error) throw error
  return data.map(toPlayer).sort(comparePlayers)
}

const jerseyConflict = (jerseyNumber: number | null) =>
  conflict(`Ya hay un jugador activo con el número ${jerseyNumber}`)

export async function createPlayer(input: PlayerCreateInput): Promise<Player> {
  const { data, error } = await db()
    .from('players')
    .insert({
      name: input.name,
      jersey_number: input.jersey_number,
      primary_position: input.primary_position,
      secondary_position: input.secondary_position,
      is_active: true,
    })
    .select(PLAYER_SELECT)
    .single()
  if (error?.code === UNIQUE_VIOLATION) throw jerseyConflict(input.jersey_number)
  if (error) throw error
  return toPlayer(data)
}

export async function updatePlayer(input: PlayerUpdateInput): Promise<Player> {
  const { data, error } = await db()
    .from('players')
    .update({
      name: input.name,
      jersey_number: input.jersey_number,
      primary_position: input.primary_position,
      secondary_position: input.secondary_position,
      is_active: input.is_active,
    })
    .eq('id', input.id)
    .select(PLAYER_SELECT)
    .maybeSingle()
  if (error?.code === UNIQUE_VIOLATION) throw jerseyConflict(input.jersey_number)
  if (error) throw error
  if (!data) throw notFound('Jugador no encontrado')
  return toPlayer(data)
}

/** Borra el jugador; sale de todas las formaciones (on delete cascade). */
export async function deletePlayer(input: PlayerDeleteInput): Promise<void> {
  const { data, error } = await db().from('players').delete().eq('id', input.id).select('id')
  if (error) throw error
  if (data.length === 0) throw notFound('Jugador no encontrado')
}
