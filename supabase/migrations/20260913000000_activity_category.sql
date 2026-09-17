-- ════════════════════════════════════════════════════════════════════════════
-- Categoría de cada actividad: 'general' (por defecto) o 'podio' (Liga Podio).
-- El dashboard destaca las de podio y las prioriza en el carrusel de próximas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.weekly_activities
  add column category text not null default 'general',
  add constraint weekly_activities_category_check check (category in ('general', 'podio'));

-- Carrusel de próximas actividades: desde una fecha en adelante.
create index weekly_activities_upcoming_idx on public.weekly_activities (activity_date, start_time)
  where not is_cancelled;
