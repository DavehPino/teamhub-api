// POST /api/admin/:action: escrituras del dashboard en una sola función (Hobby admite 12 por deploy).
// Todas exigen autorización de administrador de la organización: sesión de Supabase (Authorization: Bearer) o, solo
// para la organización por defecto, la cabecera x-admin-safeword. La organización sale de x-org-slug.
import {
  activityCreateInput,
  activityDeleteInput,
  activityUpdateInput,
  courtrackCatalogInput,
  courtrackSyncInput,
  leagueCreateInput,
  leagueDeleteInput,
  leagueSnapshotInput,
  leagueUpdateInput,
  lineupDeleteInput,
  lineupSaveInput,
  matchCreateInput,
  matchDeleteInput,
  matchUpdateInput,
  playerCreateInput,
  playerDeleteInput,
  playerUpdateInput,
  teamLinkCreateInput,
  videoDeleteInput,
  videoUpdateInput,
} from '../../shared/schemas.js'
import { inviteCreateInput, inviteRevokeInput, memberRemoveInput, memberRoleInput, orgUpdateInput } from '../../shared/onboarding.js'
import { createActivity, deleteActivity, updateActivity } from '../_lib/activities.js'
import { requireAdmin, requireOrgAdmin, type Actor } from '../_lib/admin.js'
import { getCourtrackCatalog, getCourtrackSyncStatus, runCourtrackSync } from '../_lib/courtrackSync.js'
import { handle, noStore, parseBody, pathParam, routeFor } from '../_lib/http.js'
import { createLeague, deleteLeague, getLeagueSnapshot, listLeagues, updateLeague } from '../_lib/leagues.js'
import { deleteLineup, saveLineup } from '../_lib/lineups.js'
import { createMatch, deleteMatch, updateMatch } from '../_lib/matches.js'
import { createInvite, listInvites, listMembers, removeMember, revokeInvite, setMemberRole, updateOrg } from '../_lib/members.js'
import { createPlayer, deletePlayer, updatePlayer } from '../_lib/players.js'
import { createTeamLink } from '../_lib/teamLinks.js'
import { resolveOrg, type Org } from '../_lib/tenant.js'
import { deleteVideo, updateVideo } from '../_lib/videos.js'

/** Quién hace la petición: los handlers que no lo necesitan simplemente ignoran el tercer parámetro. */
type AdminHandler = (request: Request, org: Org, actor: Actor) => Promise<Response>

/** Acciones solo para administradores del club con sesión (no valen las palabras clave ni el rol `coach`). */
const ADMIN_ONLY = new Set(['members', 'member-role', 'member-remove', 'invites', 'invite-create', 'invite-revoke'])

const actions: Record<string, AdminHandler> = {
  // POST /api/admin/verify → { ok: true } si la palabra clave o la sesión son correctas; 401/403 si no.
  verify: async () => noStore({ ok: true }),

  // POST /api/admin/activities → 201 Activity. Crea la actividad y, si se pide, el rival.
  activities: async (request, org) =>
    noStore(await createActivity(org, await parseBody(request, activityCreateInput)), 201),

  // POST /api/admin/activity-update → Activity. Edita la actividad y, si se pide, crea el rival.
  'activity-update': async (request, org) =>
    noStore(await updateActivity(org, await parseBody(request, activityUpdateInput))),

  // POST /api/admin/activity-delete → { ok: true }. Borra la actividad.
  'activity-delete': async (request, org) => {
    await deleteActivity(org, await parseBody(request, activityDeleteInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/matches → 201 MatchCreated. Crea el partido y, si se pide, el rival.
  matches: async (request, org) => noStore(await createMatch(org, await parseBody(request, matchCreateInput)), 201),

  // POST /api/admin/match-update → MatchCreated. Edita el partido (el slug no cambia) y, si se pide, crea el rival.
  'match-update': async (request, org) => noStore(await updateMatch(org, await parseBody(request, matchUpdateInput))),

  // POST /api/admin/match-delete → { ok: true }. Borra el partido, sus videos y sus archivos del bucket.
  'match-delete': async (request, org) => {
    await deleteMatch(org, await parseBody(request, matchDeleteInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/video-update → Video. Cambia el título y el set de un video.
  'video-update': async (request, org) => noStore(await updateVideo(org, await parseBody(request, videoUpdateInput))),

  // POST /api/admin/video-delete → { ok: true }. Borra el archivo del bucket y la fila del video.
  'video-delete': async (request, org) => {
    await deleteVideo(org, await parseBody(request, videoDeleteInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/courtrack-status → CourtrackSyncStatus. Cupo, ligas configuradas y últimas sincronizaciones (vía courtrack-service).
  'courtrack-status': async (_request, org) => noStore(await getCourtrackSyncStatus(org)),

  // POST /api/admin/courtrack-sync { league_id?, dry_run? } → con league_id, CourtrackSyncResult de esa temporada; sin él,
  // CourtrackSyncAllResult de todas las ligas activas (un solo cupo). 429 `quota_exceeded` si se agotó el cupo diario.
  'courtrack-sync': async (request, org) => {
    const input = await parseBody(request, courtrackSyncInput)
    return noStore(await runCourtrackSync(org, input.league_id ?? null, input.dry_run))
  },

  // POST /api/admin/league-snapshot { id } → CourtrackLeagueSnapshot. Clasificación y fixture guardados en el último sync.
  'league-snapshot': async (request, org) =>
    noStore(await getLeagueSnapshot(org, (await parseBody(request, leagueSnapshotInput)).id)),

  // POST /api/admin/courtrack-catalog { resource, id_cliente?, liga_id? } → asociaciones, ligas o equipos de CourtTrack.
  'courtrack-catalog': async (request, org) =>
    noStore(await getCourtrackCatalog(org, await parseBody(request, courtrackCatalogInput))),

  // POST /api/admin/leagues → CourtrackLeague[]. Ligas de CourtTrack configuradas (sin pasar por el servicio).
  leagues: async (_request, org) => noStore(await listLeagues(org)),

  // POST /api/admin/league-create → 201 CourtrackLeague. Da de alta una liga (409 si ya estaba).
  'league-create': async (request, org) =>
    noStore(await createLeague(org, await parseBody(request, leagueCreateInput)), 201),

  // POST /api/admin/league-update → CourtrackLeague. Cambia el equipo propio de la temporada.
  'league-update': async (request, org) => noStore(await updateLeague(org, await parseBody(request, leagueUpdateInput))),

  // POST /api/admin/league-delete → { ok: true }. Quita la liga; los partidos y la competición se conservan.
  'league-delete': async (request, org) => {
    await deleteLeague(org, (await parseBody(request, leagueDeleteInput)).id)
    return noStore({ ok: true })
  },

  // POST /api/admin/team-link-create → { ok: true }. Vincula un nombre de CourtTrack a un rival existente.
  'team-link-create': async (request, org) =>
    noStore(await createTeamLink(org, await parseBody(request, teamLinkCreateInput))),

  // POST /api/admin/members → OrgMember[]. Miembros del club (administradores primero). Solo administradores.
  members: async (_request, org, actor) => noStore(await listMembers(org, requireOrgAdmin(actor))),

  // POST /api/admin/member-role { user_id, role } → { ok: true }. 409 `last_admin` si dejaría el club sin administradores.
  'member-role': async (request, org) => {
    await setMemberRole(org, await parseBody(request, memberRoleInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/member-remove { user_id } → { ok: true }. 409 `last_admin` si es el único administrador.
  'member-remove': async (request, org) => {
    await removeMember(org, await parseBody(request, memberRemoveInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/org-update { name?, theme? } → OrgInfo. Nombre, colores y escudo del club. Solo administradores.
  'org-update': async (request, org, actor) => {
    requireOrgAdmin(actor)
    return noStore(await updateOrg(org, await parseBody(request, orgUpdateInput)))
  },

  // POST /api/admin/invites → OrgInvite[]. Códigos activos con su número de usos.
  invites: async (_request, org) => noStore(await listInvites(org)),

  // POST /api/admin/invite-create { role?, max_uses? } → 201 OrgInvite. Código que no caduca; sin max_uses es ilimitado.
  'invite-create': async (request, org, actor) =>
    noStore(await createInvite(org, requireOrgAdmin(actor), await parseBody(request, inviteCreateInput)), 201),

  // POST /api/admin/invite-revoke { code } → { ok: true }. Quien ya entró se queda; nadie más puede usar el código.
  'invite-revoke': async (request, org) => {
    await revokeInvite(org, await parseBody(request, inviteRevokeInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/player-create → 201 Player. Alta en el plantel (409 si el número ya lo usa un activo).
  'player-create': async (request, org) =>
    noStore(await createPlayer(org, await parseBody(request, playerCreateInput)), 201),

  // POST /api/admin/player-update → Player. Edita el jugador, incluido si está activo.
  'player-update': async (request, org) => noStore(await updatePlayer(org, await parseBody(request, playerUpdateInput))),

  // POST /api/admin/player-delete → { ok: true }. Borra el jugador y lo quita de todas las formaciones.
  'player-delete': async (request, org) => {
    await deletePlayer(org, await parseBody(request, playerDeleteInput))
    return noStore({ ok: true })
  },

  // POST /api/admin/lineup-save → Lineup. Sin id crea la formación; con id la reemplaza (409 si el nombre existe).
  'lineup-save': async (request, org) => noStore(await saveLineup(org, await parseBody(request, lineupSaveInput))),

  // POST /api/admin/lineup-delete → { ok: true }. Borra la formación.
  'lineup-delete': async (request, org) => {
    await deleteLineup(org, await parseBody(request, lineupDeleteInput))
    return noStore({ ok: true })
  },
}

export const POST = handle(async (request) => {
  const action = routeFor(actions, pathParam(request))
  const org = await resolveOrg(request)
  const actor = await requireAdmin(request, org)
  if (ADMIN_ONLY.has(pathParam(request))) requireOrgAdmin(actor)
  return action(request, org, actor)
})
