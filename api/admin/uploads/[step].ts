// POST /api/admin/uploads/:step: subida multiparte de videos en una sola función (Hobby admite 12 por deploy).
// Todas exigen la cabecera x-admin-safeword.
import { uploadAbortInput, uploadCompleteInput, uploadStartInput } from '../../../shared/schemas.js'
import { requireAdmin } from '../../_lib/admin.js'
import { handle, noStore, parseBody, pathParam, routeFor, type Handler } from '../../_lib/http.js'
import { abortVideoUpload, completeVideoUpload, startVideoUpload } from '../../_lib/uploads.js'

const steps: Record<string, Handler> = {
  // POST /api/admin/uploads/start → UploadStart: crea la subida multiparte y firma una URL por trozo.
  start: async (request) => noStore(await startVideoUpload(await parseBody(request, uploadStartInput))),

  // POST /api/admin/uploads/complete → 201 Video: cierra la subida y registra el video en el partido.
  complete: async (request) =>
    noStore(await completeVideoUpload(await parseBody(request, uploadCompleteInput)), 201),

  // POST /api/admin/uploads/abort → { ok: true }: descarta los trozos de una subida cancelada.
  abort: async (request) => {
    await abortVideoUpload(await parseBody(request, uploadAbortInput))
    return noStore({ ok: true })
  },
}

export const POST = handle(async (request) => {
  const step = routeFor(steps, pathParam(request))
  await requireAdmin(request)
  return step(request)
})
