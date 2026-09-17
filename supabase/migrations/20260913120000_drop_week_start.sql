-- ════════════════════════════════════════════════════════════════════════════
-- Las actividades ya no se agrupan por semana: el dashboard muestra las próximas
-- ordenadas por fecha y hora (índice weekly_activities_upcoming_idx).
-- ════════════════════════════════════════════════════════════════════════════

drop index if exists public.weekly_activities_week_idx;

alter table public.weekly_activities drop column if exists week_start;
