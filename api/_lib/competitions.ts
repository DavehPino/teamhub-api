// Competiciones de la organización (ligas, amistosos, torneos): la lista de los filtros y del formulario de partido.
import { COMPETITION_KINDS, type CompetitionKind } from '../../shared/domain.js'
import type { Competition, CompetitionListItem, CompetitionSeason } from '../../shared/schemas.js'
import { env } from './env.js'
import { badRequest } from './http.js'
import { toCompetition } from './mappers.js'
import { db } from './supabase.js'

const UNIQUE_VIOLATION = '23505'

/** Ligas primero, después el resto; dentro de cada tipo por nombre. */
const KIND_ORDER: Record<CompetitionKind, number> = { league: 0, tournament: 1, friendly: 2, other: 3 }

/** Todas las competiciones con su número de partidos jugados y sus temporadas de CourtTrack (abiertas y archivadas). */
export async function listCompetitions(): Promise<CompetitionListItem[]> {
  const [{ data, error }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    db().from('competitions').select('id,name,kind,matches(count)').eq('org_id', env.orgId),
    db()
      .from('courtrack_leagues')
      .select('id,competition_id,season_label,archived_at,created_at,matches(count)')
      .eq('org_id', env.orgId)
      .order('created_at', { ascending: false }),
  ])
  if (error) throw error
  if (seasonsError) throw seasonsError

  const seasons = new Map<string, CompetitionSeason[]>()
  for (const row of seasonRows) {
    const list = seasons.get(row.competition_id) ?? []
    list.push({
      id: row.id,
      label: row.season_label,
      archived: row.archived_at !== null,
      match_count: row.matches[0]?.count ?? 0,
    })
    seasons.set(row.competition_id, list)
  }

  return data
    .map((row) => ({ ...toCompetition(row), match_count: row.matches[0]?.count ?? 0, seasons: seasons.get(row.id) ?? [] }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'es'))
}

/** Competición por id, solo si es de esta organización. */
export async function getCompetition(id: string): Promise<Competition | null> {
  const { data, error } = await db()
    .from('competitions')
    .select('id,name,kind')
    .eq('id', id)
    .eq('org_id', env.orgId)
    .maybeSingle()
  if (error) throw error
  return data ? toCompetition(data) : null
}

/** Lanza 400 si la competición no existe (o no es de esta organización). */
export async function requireCompetition(id: string): Promise<Competition> {
  const competition = await getCompetition(id)
  if (!competition) throw badRequest('La competición elegida ya no existe')
  return competition
}

/** Busca por nombre (sin distinguir mayúsculas) o la crea. */
export async function ensureCompetition(name: string, kind: CompetitionKind): Promise<Competition> {
  const trimmed = name.trim()
  const { data: existing, error: findError } = await db()
    .from('competitions')
    .select('id,name,kind')
    .eq('org_id', env.orgId)
    .ilike('name', trimmed)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return toCompetition(existing)

  const { data, error } = await db()
    .from('competitions')
    .insert({ org_id: env.orgId, name: trimmed, kind: COMPETITION_KINDS.includes(kind) ? kind : 'other' })
    .select('id,name,kind')
    .single()
  if (error?.code === UNIQUE_VIOLATION) return ensureCompetition(trimmed, kind)
  if (error) throw error
  return toCompetition(data)
}
