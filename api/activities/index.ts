// GET /api/activities?from=YYYY-MM-DD&limit=30 → Activity[] (próximas no canceladas, de la más cercana a la más lejana)
import { todayIsoDate } from '../../shared/dates.js'
import { upcomingActivitiesQuery } from '../../shared/schemas.js'
import { listUpcomingActivities } from '../_lib/activities.js'
import { cached, handle, parseQuery } from '../_lib/http.js'

export const GET = handle(async (request) => {
  const { from, limit } = parseQuery(request, upcomingActivitiesQuery)
  return cached(await listUpcomingActivities(from ?? todayIsoDate(), limit))
})
