-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tenant, fase 2: unicidades por organización.
--
-- Hasta ahora estas unicidades eran globales (un solo equipo por base de datos). Con varias organizaciones, dos clubes
-- tienen que poder usar el mismo slug de partido, el mismo dorsal, el mismo nombre de formación o el mismo rival.
-- Cada índice nuevo se crea ANTES de borrar el antiguo. Con una sola organización los datos existentes cumplen
-- las dos reglas, así que no puede fallar.
--
-- Aplicar ANTES de dar de alta la segunda organización, y después de desplegar el código de la fase 2 (que ya filtra
-- por org_id). videos.storage_key sigue siendo único global a propósito: las claves de cada organización llevan su
-- propio prefijo en el bucket (orgs/<slug>/...), así que no colisionan, y el upsert onConflict 'storage_key' lo necesita.
--
-- NO quita los DEFAULT de org_id: courtrack-service aún inserta partidos y rivales sin org_id (fase 5).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── matches.slug: único por organización ───────────────────────────────────
create unique index matches_org_slug_key on public.matches (org_id, slug);

-- El UNIQUE de columna tiene un nombre generado por Postgres: se localiza por sus columnas en vez de asumirlo.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.matches'::regclass
    and c.contype = 'u'
    and c.conkey = array[(select attnum from pg_attribute where attrelid = 'public.matches'::regclass and attname = 'slug')];
  if v_constraint is null then
    raise exception 'No se encontró el UNIQUE global de matches.slug';
  end if;
  execute format('alter table public.matches drop constraint %I', v_constraint);
end $$;

-- ─── matches.courtrack_id: único por organización ───────────────────────────
-- Dos clubes pueden seguir la misma liga de CourtTrack e importar el mismo partido.
create unique index matches_org_courtrack_id_key on public.matches (org_id, courtrack_id) where courtrack_id is not null;
drop index public.matches_courtrack_id_key;

-- ─── teams: nombre y categoría únicos por organización ──────────────────────
create unique index teams_org_name_category_key on public.teams (org_id, lower(name), coalesce(lower(category), ''));
drop index public.teams_name_category_key;

-- ─── players: dorsal único entre jugadores activos de la organización ───────
create unique index players_org_active_jersey_key on public.players (org_id, jersey_number)
  where is_active and jersey_number is not null;
drop index public.players_active_jersey_key;

-- ─── lineups: nombre único (sin distinguir mayúsculas) por organización ─────
create unique index lineups_org_name_key on public.lineups (org_id, lower(trim(name)));
drop index public.lineups_name_key;
