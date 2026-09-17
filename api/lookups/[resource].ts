// GET /api/lookups/:resource → listas para filtros y formularios, agrupadas en una función (Hobby admite 12).
//   /api/lookups/teams        → TeamSummary[] (rivales por nombre)
//   /api/lookups/competitions → CompetitionListItem[] (con número de partidos)
//   /api/lookups/players      → Player[] (activos primero, por número y nombre)
//   /api/lookups/lineups      → Lineup[] con sus jugadores en cancha (la más reciente primero)
// Sin caché: el formulario de alta tiene que ver al instante un equipo o una competición recién creados.
import { listCompetitions } from '../_lib/competitions.js'
import { handle, noStore, pathParam, routeFor, type Handler } from '../_lib/http.js'
import { listLineups } from '../_lib/lineups.js'
import { listPlayers } from '../_lib/players.js'
import { listRivalTeams } from '../_lib/teams.js'

const resources: Record<string, Handler> = {
  teams: async () => noStore(await listRivalTeams()),
  competitions: async () => noStore(await listCompetitions()),
  players: async () => noStore(await listPlayers()),
  lineups: async () => noStore(await listLineups()),
}

export const GET = handle(async (request) => routeFor(resources, pathParam(request))(request))
