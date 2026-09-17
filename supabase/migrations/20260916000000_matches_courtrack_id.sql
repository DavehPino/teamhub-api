-- ════════════════════════════════════════════════════════════════════════════
-- Partidos importados desde CourtTrack (microservicio courtrack-service).
-- `courtrack_id` es el id del partido en CourtTrack: permite volver a sincronizar
-- sin duplicar ni pisar partidos cargados a mano (que lo tienen a null).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.matches add column courtrack_id text;

create unique index matches_courtrack_id_key
  on public.matches (courtrack_id)
  where courtrack_id is not null;
