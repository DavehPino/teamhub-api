// GET /api/lookups/:resource → listas para filtros y formularios, agrupadas en una función (Hobby admite 12).
//   /api/lookups/teams        → TeamSummary[] (rivales por nombre)
//   /api/lookups/competitions → CompetitionListItem[] (con número de partidos)
//   /api/lookups/players      → Player[] (activos primero, por número y nombre)
//   /api/lookups/lineups      → Lineup[] con sus jugadores en cancha (la más reciente primero)
//   /api/lookups/org          → OrgInfo { slug, name, theme }: lo que ve un invitado sin cuenta
// POST /api/lookups/guest-code { code } → GuestAccess { slug, name }: canjea un código de invitado (un solo uso). Sin x-org-slug ni sesión.
// Sin caché: el formulario de alta tiene que ver al instante un equipo o una competición recién creados.
import { guestCodeRedeemInput } from '../../shared/onboarding.js'
import { listCompetitions } from '../_lib/competitions.js'
import { redeemGuestCode } from '../_lib/guestCodes.js'
import { handle, noStore, parseBody, pathParam, routeFor } from '../_lib/http.js'
import { listLineups } from '../_lib/lineups.js'
import { getOrgInfo } from '../_lib/members.js'
import { listPlayers } from '../_lib/players.js'
import { listRivalTeams } from '../_lib/teams.js'
import { resolveOrg, type OrgHandler } from '../_lib/tenant.js'

const resources: Record<string, OrgHandler> = {
  teams: async (_request, org) => noStore(await listRivalTeams(org)),
  competitions: async (_request, org) => noStore(await listCompetitions(org)),
  players: async (_request, org) => noStore(await listPlayers(org)),
  lineups: async (_request, org) => noStore(await listLineups(org)),
  org: async (_request, org) => noStore(await getOrgInfo(org)),
}

export const GET = handle(async (request) => {
  const resource = routeFor(resources, pathParam(request))
  return resource(request, await resolveOrg(request))
})

const writes: Record<string, (request: Request) => Promise<Response>> = {
  'guest-code': async (request) => noStore(await redeemGuestCode(await parseBody(request, guestCodeRedeemInput))),
}

// Sin resolveOrg: el código ya dice a qué club da acceso (y sin x-org-slug se tomaría el club por defecto).
export const POST = handle(async (request) => routeFor(writes, pathParam(request))(request))
