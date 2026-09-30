-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tenant, fase 5: cupo de sincronizaciones con CourtTrack por organización.
--
-- courtrack-service limitaba a todas las organizaciones con la misma variable SYNC_DAILY_LIMIT. Ahora cada
-- organización puede tener el suyo (planes distintos); NULL = usar el de la variable de entorno del servicio.
-- Migración ADITIVA: el servicio anterior ignora la columna.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column courtrack_daily_limit integer,
  add constraint organizations_courtrack_daily_limit_check
    check (courtrack_daily_limit is null or courtrack_daily_limit >= 0);
