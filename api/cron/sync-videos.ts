// Vercel Cron diario: sincroniza la tabla `videos` con el bucket. La consulta a Supabase
// también evita que el plan Free pause el proyecto por inactividad.
// Manual:  curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/sync-videos
import { handle, noStore, requireCronSecret } from '../_lib/http.js'
import { syncBucketVideos } from '../_lib/videos.js'

export const GET = handle(async (request) => {
  requireCronSecret(request)
  return noStore(await syncBucketVideos())
})
