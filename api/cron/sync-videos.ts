// Vercel Cron diario: sincroniza la tabla `videos` con el bucket, organización por organización. La consulta a Supabase
// también evita que el plan Free pause el proyecto por inactividad.
// Manual:  curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/sync-videos
// Respuesta: { "<slug>": SyncResult | { error } }. El fallo de una organización (p. ej. su carpeta del bucket) no
// impide sincronizar las demás.
import { handle, noStore, requireCronSecret } from '../_lib/http.js'
import { listOrgs } from '../_lib/tenant.js'
import { syncBucketVideos } from '../_lib/videos.js'

export const GET = handle(async (request) => {
  requireCronSecret(request)
  const results: Record<string, unknown> = {}
  for (const org of await listOrgs()) {
    try {
      results[org.slug] = await syncBucketVideos(org)
    } catch (err) {
      console.error(`Sincronización de videos de ${org.slug}`, err)
      results[org.slug] = { error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  }
  return noStore(results)
})
