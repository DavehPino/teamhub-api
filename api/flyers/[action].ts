// /api/flyers/:action: sección Flyers en una sola función (Hobby admite 12 por deploy).
// La lectura es libre; todo lo que escribe en el bucket o usa la IA exige acceso a la organización: sesión de Supabase
// o, solo para la organización por defecto, la cabecera x-flyers-safeword (FLYERS_SAFEWORD), independiente de la
// palabra clave de actividades y partidos. La organización sale de x-org-slug.
import {
  flyerImageDeleteInput,
  flyerImageRenameInput,
  flyerImageSaveInput,
  flyerSuggestInput,
  flyerUploadUrlInput,
  savedFlyerDeleteInput,
  savedFlyerSaveInput,
} from '../../shared/flyers.js'
import { requireFlyersAccess } from '../_lib/admin.js'
import {
  createUploadUrl,
  deleteFlyer,
  deleteImage,
  getFlyerLibrary,
  renameImage,
  saveFlyer,
  saveImage,
} from '../_lib/flyerLibrary.js'
import { suggestFlyer } from '../_lib/flyers.js'
import { handle, noStore, parseBody, pathParam, routeFor } from '../_lib/http.js'
import { resolveOrg, type OrgHandler } from '../_lib/tenant.js'

const reads: Record<string, OrgHandler> = {
  // GET /api/flyers/library → FlyerLibrary: imágenes y flyers guardados con sus URLs de lectura.
  library: async (_request, org) => noStore(await getFlyerLibrary(org)),
}

const writes: Record<string, OrgHandler> = {
  // POST /api/flyers/verify → { ok: true } si la palabra clave de flyers es correcta; 401 si no.
  verify: async () => noStore({ ok: true }),

  // POST /api/flyers/suggest → FlyerSuggestion. El asistente de IA reescribe el flyer según el pedido.
  suggest: async (request, org) => noStore(await suggestFlyer(org, await parseBody(request, flyerSuggestInput))),

  // POST /api/flyers/upload-url → FlyerUploadUrl: URL firmada para subir una imagen o el PNG de un flyer.
  'upload-url': async (request, org) => noStore(await createUploadUrl(org, await parseBody(request, flyerUploadUrlInput))),

  // POST /api/flyers/image-save → 201 FlyerImage: registra la imagen ya subida con su nombre.
  'image-save': async (request, org) => noStore(await saveImage(org, await parseBody(request, flyerImageSaveInput)), 201),

  // POST /api/flyers/image-rename → FlyerImage.
  'image-rename': async (request, org) => noStore(await renameImage(org, await parseBody(request, flyerImageRenameInput))),

  // POST /api/flyers/image-delete → { ok: true }: borra la imagen y su JSON del bucket.
  'image-delete': async (request, org) => {
    await deleteImage(org, await parseBody(request, flyerImageDeleteInput))
    return noStore({ ok: true })
  },

  // POST /api/flyers/flyer-save → 201 SavedFlyer: registra el flyer cuyo PNG ya se subió.
  'flyer-save': async (request, org) => noStore(await saveFlyer(org, await parseBody(request, savedFlyerSaveInput)), 201),

  // POST /api/flyers/flyer-delete → { ok: true }: borra el PNG y el JSON del flyer.
  'flyer-delete': async (request, org) => {
    await deleteFlyer(org, await parseBody(request, savedFlyerDeleteInput))
    return noStore({ ok: true })
  },
}

export const GET = handle(async (request) => {
  const read = routeFor(reads, pathParam(request))
  return read(request, await resolveOrg(request))
})

export const POST = handle(async (request) => {
  const action = routeFor(writes, pathParam(request))
  const org = await resolveOrg(request)
  await requireFlyersAccess(request, org)
  return action(request, org)
})
