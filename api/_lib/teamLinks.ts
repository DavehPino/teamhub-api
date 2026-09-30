// Vínculos "nombre del rival en CourtTrack → equipo del dashboard" (tabla courtrack_team_links).
// El microservicio los crea solo al sincronizar; desde la vista previa se pueden fijar a mano para unir grafías.
import { slugify } from '../../shared/matches.js'
import type { TeamLinkCreateInput } from '../../shared/schemas.js'
import { badRequest } from './http.js'
import { db } from './supabase.js'
import { getRivalTeam } from './teams.js'
import type { Org } from './tenant.js'

export async function createTeamLink(org: Org, input: TeamLinkCreateInput): Promise<{ ok: true }> {
  const team = await getRivalTeam(org, input.team_id)
  if (!team) throw badRequest('El equipo rival elegido no existe')
  const normalized = slugify(input.courtrack_name)
  if (!normalized) throw badRequest('El nombre de CourtTrack no es válido')

  const { error } = await db()
    .from('courtrack_team_links')
    .upsert(
      {
        org_id: org.slug,
        organization_id: org.id,
        courtrack_name: input.courtrack_name.trim(),
        normalized_name: normalized,
        team_id: team.id,
      },
      { onConflict: 'org_id,normalized_name' },
    )
  if (error) throw error
  return { ok: true }
}
