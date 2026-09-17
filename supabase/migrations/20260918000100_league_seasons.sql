-- ════════════════════════════════════════════════════════════════════════════
-- Temporadas: CourtTrack resetea las ligas al terminar (PODIO siempre). Cada
-- fila de courtrack_leagues pasa a ser UNA temporada de la liga. Cuando el sync
-- detecta el reseteo, archiva la fila (archived_at) y abre otra para la nueva
-- temporada bajo la misma competición; los partidos siguen colgados de la suya
-- (matches.courtrack_league_id), así que el histórico no se pierde.
-- En cada sync se guarda además una instantánea de la clasificación y del
-- fixture completo de la liga, que queda congelada al archivar.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.courtrack_leagues
  -- Nombre de la temporada tal como la publica CourtTrack en ese momento
  add column season_label   text,
  add column archived_at    timestamptz,
  -- 'reset' = CourtTrack reinició la liga | 'removed' = la liga ya no existe | 'manual'
  add column archive_reason text,
  -- Instantánea de CourtTrack en el último sync: getPosiciones (todas las etapas) y findPartidos
  add column standings      jsonb,
  add column fixture        jsonb,
  add column snapshot_at    timestamptz,
  add constraint courtrack_leagues_archive_reason_check
    check (archive_reason is null or archive_reason in ('reset', 'removed', 'manual'));

update public.courtrack_leagues set season_label = liga_name where season_label is null;

alter table public.courtrack_leagues alter column season_label set not null;

-- Solo puede haber una temporada abierta por liga; las archivadas conservan el mismo liga_id.
drop index if exists public.courtrack_leagues_org_liga_key;
create unique index courtrack_leagues_org_liga_open_key
  on public.courtrack_leagues (org_id, liga_id)
  where archived_at is null;

create index courtrack_leagues_archived_idx on public.courtrack_leagues (org_id, archived_at desc) where archived_at is not null;
