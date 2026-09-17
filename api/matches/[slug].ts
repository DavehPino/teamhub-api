// GET /api/matches/:slug             → MatchDetail (404 si no existe)
// GET /api/matches/:slug?view=stats  → MatchStats: progresión, estadísticas y formaciones desde CourtTrack
//                                      (404 `no_stats` si el partido no vino del sync; 503 si el servicio no está configurado)
import { z } from 'zod'
import { matchSlugSchema } from '../../shared/schemas.js'
import { badRequest, cached, handle, notFound, parseQuery, pathParam } from '../_lib/http.js'
import { getMatchBySlug } from '../_lib/matches.js'
import { getMatchStatsBySlug } from '../_lib/matchStats.js'

/** Las estadísticas de un partido jugado no cambian: una hora en el navegador. */
const STATS_CACHE = 'private, max-age=3600'

export const GET = handle(async (request) => {
  const slug = matchSlugSchema.safeParse(pathParam(request))
  if (!slug.success) throw badRequest('Slug inválido')
  const { view } = parseQuery(request, z.object({ view: z.enum(['stats']).optional() }))

  if (view === 'stats') {
    const stats = await getMatchStatsBySlug(slug.data)
    if (!stats) throw notFound('Partido no encontrado')
    return cached(stats, STATS_CACHE)
  }

  const match = await getMatchBySlug(slug.data)
  if (!match) throw notFound('Partido no encontrado')
  return cached(match)
})
