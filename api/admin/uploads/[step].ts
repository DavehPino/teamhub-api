// POST /api/admin/uploads/:step: subida multiparte de videos en una sola función (Hobby admite 12 por deploy).
// Todas exigen autorización de administrador de la organización (ver api/admin/[action].ts).
import { uploadAbortInput, uploadCompleteInput, uploadStartInput } from '../../../shared/schemas.js'
import { requireAdmin } from '../../_lib/admin.js'
import { handle, noStore, parseBody, pathParam, routeFor } from '../../_lib/http.js'
import { resolveOrg, type OrgHandler } from '../../_lib/tenant.js'
import { abortVideoUpload, completeVideoUpload, startVideoUpload } from '../../_lib/uploads.js'

const steps: Record<string, OrgHandler> = {
  // POST /api/admin/uploads/start → UploadStart: crea la subida multiparte y firma una URL por trozo.
  start: async (request, org) => noStore(await startVideoUpload(org, await parseBody(request, uploadStartInput))),

  // POST /api/admin/uploads/complete → 201 Video: cierra la subida y registra el video en el partido.
  complete: async (request, org) =>
    noStore(await completeVideoUpload(org, await parseBody(request, uploadCompleteInput)), 201),

  // POST /api/admin/uploads/abort → { ok: true }: descarta los trozos de una subida cancelada.
  abort: async (request, org) => {
    await abortVideoUpload(org, await parseBody(request, uploadAbortInput))
    return noStore({ ok: true })
  },
}

export const POST = handle(async (request) => {
  const step = routeFor(steps, pathParam(request))
  const org = await resolveOrg(request)
  await requireAdmin(request, org)
  return step(request, org)
})
