// /api/me/:action: lo que hace una persona con SU cuenta, antes y fuera de cualquier club (no lleva x-org-slug).
// Todas exigen `Authorization: Bearer <jwt de Supabase Auth>`.
//   GET  /api/me/orgs          → MyOrgs { orgs: [{slug, name, role}], can_create_org }
//   POST /api/me/org-create    { name } → 201 MyOrg. 402 `plan_required` si su cuenta no puede crear clubes (muro de pago),
//                              409 `org_limit_reached` si ya creó todos los que permite.
//   POST /api/me/invite-accept { code } → JoinedOrg. 404 `invite_invalid`, 409 `invite_exhausted`.
//   POST /api/me/org-leave     { slug } → { ok: true }. 409 `last_admin` si es el único administrador.
import { inviteAcceptInput, orgCreateInput, orgLeaveInput } from '../../shared/onboarding.js'
import { requireUser } from '../_lib/admin.js'
import { handle, noStore, parseBody, pathParam, routeFor } from '../_lib/http.js'
import { acceptInvite, createMyOrg, leaveOrg, listMyOrgs } from '../_lib/onboarding.js'

type UserHandler = (request: Request, userId: string) => Promise<Response>

const reads: Record<string, UserHandler> = {
  orgs: async (_request, userId) => noStore(await listMyOrgs(userId)),
}

const writes: Record<string, UserHandler> = {
  'org-create': async (request, userId) => noStore(await createMyOrg(userId, await parseBody(request, orgCreateInput)), 201),

  'invite-accept': async (request, userId) => noStore(await acceptInvite(userId, await parseBody(request, inviteAcceptInput))),

  'org-leave': async (request, userId) => {
    await leaveOrg(userId, await parseBody(request, orgLeaveInput))
    return noStore({ ok: true })
  },
}

export const GET = handle(async (request) => {
  const read = routeFor(reads, pathParam(request))
  return read(request, await requireUser(request))
})

export const POST = handle(async (request) => {
  const write = routeFor(writes, pathParam(request))
  return write(request, await requireUser(request))
})
