// GET /api/videos/:id/playback → Playback (URL pública o firmada; nunca se cachea)
import { z } from 'zod'
import { badRequest, handle, noStore, notFound, pathParam } from '../../_lib/http.js'
import { resolveOrg } from '../../_lib/tenant.js'
import { getVideoById, playbackFor } from '../../_lib/videos.js'

export const GET = handle(async (request) => {
  const org = await resolveOrg(request)
  const id = z.uuid().safeParse(pathParam(request, 1))
  if (!id.success) throw badRequest('Identificador de video inválido')

  const video = await getVideoById(org, id.data)
  if (!video || video.status === 'archived') throw notFound('Video no encontrado')
  return noStore(await playbackFor(video))
})
