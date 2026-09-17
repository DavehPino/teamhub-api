-- ════════════════════════════════════════════════════════════════════════════
-- Competiciones como entidad propia y ligas de CourtTrack por organización.
-- Hasta ahora la competición era texto libre en matches.competition y la liga a
-- sincronizar vivía en variables de entorno del microservicio courtrack-service.
-- Ahora una organización (org_id; hoy solo 'coyotes') puede seguir varias ligas
-- de CourtTrack, cada una colgada de una competición del dashboard.
--
-- Migración ADITIVA: matches.competition (texto) se conserva hasta que ambos
-- deploys escriban competition_id; se elimina en una migración posterior.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── competitions: ligas, amistosos, torneos... de una organización ─────────
create table public.competitions (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null,
  name       text not null,
  -- 'league' | 'friendly' | 'tournament' | 'other' (shared/domain.ts COMPETITION_KINDS)
  kind       text not null default 'league',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_org_not_blank check (length(trim(org_id)) > 0),
  constraint competitions_name_not_blank check (length(trim(name)) > 0),
  constraint competitions_kind_check check (kind in ('league', 'friendly', 'tournament', 'other'))
);

create unique index competitions_org_name_key on public.competitions (org_id, lower(name));

create trigger competitions_set_updated_at
  before update on public.competitions
  for each row execute function public.set_updated_at();

-- ─── courtrack_leagues: liga de CourtTrack que alimenta una competición ─────
-- Varias temporadas (ligas de CourtTrack) pueden colgar de la misma competición.
-- Torneos y etapas NO se guardan: CourtTrack añade etapas a mitad de temporada
-- (playoffs), así que el servicio los resuelve en cada sync con getLigas.
create table public.courtrack_leagues (
  id             uuid primary key default gen_random_uuid(),
  org_id         text not null,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  -- Asociación en CourtTrack (getClientes), p.ej. PODIO = 5
  id_cliente     integer not null,
  cliente_name   text,
  -- Liga en CourtTrack (getLigas?id_cliente=)
  liga_id        integer not null,
  liga_name      text not null,
  -- Nombre del equipo propio tal como aparece en esa liga (p.ej. 'COYOTES')
  team_name      text not null,
  team_logo_url  text,
  -- false = pausada: no aparece para sincronizar, pero conserva historial y partidos
  is_active      boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint courtrack_leagues_org_not_blank check (length(trim(org_id)) > 0),
  constraint courtrack_leagues_team_not_blank check (length(trim(team_name)) > 0)
);

create unique index courtrack_leagues_org_liga_key on public.courtrack_leagues (org_id, liga_id);
create index courtrack_leagues_org_idx on public.courtrack_leagues (org_id, is_active);
create index courtrack_leagues_competition_idx on public.courtrack_leagues (competition_id);

create trigger courtrack_leagues_set_updated_at
  before update on public.courtrack_leagues
  for each row execute function public.set_updated_at();

-- ─── courtrack_team_links: nombre en CourtTrack → equipo del dashboard ──────
-- Sustituye a la variable COURTRACK_TEAM_ALIASES. normalized_name = slugify(courtrack_name)
-- calculado por la app (misma regla que shared/matches.ts y courtrack-service/api/_lib/text.ts).
create table public.courtrack_team_links (
  id              uuid primary key default gen_random_uuid(),
  org_id          text not null,
  courtrack_name  text not null,
  normalized_name text not null,
  team_id         uuid not null references public.teams (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint courtrack_team_links_org_not_blank check (length(trim(org_id)) > 0),
  constraint courtrack_team_links_name_not_blank check (length(trim(normalized_name)) > 0)
);

create unique index courtrack_team_links_org_name_key on public.courtrack_team_links (org_id, normalized_name);
create index courtrack_team_links_team_idx on public.courtrack_team_links (team_id);

-- ─── matches: competición y liga de origen ──────────────────────────────────
alter table public.matches
  add column competition_id uuid references public.competitions (id) on delete restrict,
  add column courtrack_league_id uuid references public.courtrack_leagues (id) on delete set null;

create index matches_competition_idx on public.matches (competition_id, played_on desc);
create index matches_courtrack_league_idx on public.matches (courtrack_league_id);

-- ─── sync_log: liga sincronizada ────────────────────────────────────────────
alter table public.sync_log
  add column courtrack_league_id uuid references public.courtrack_leagues (id) on delete set null;

create index sync_log_league_idx on public.sync_log (courtrack_league_id, started_at desc);

-- ─── Seguridad: solo el backend accede ──────────────────────────────────────
alter table public.competitions         enable row level security;
alter table public.courtrack_leagues    enable row level security;
alter table public.courtrack_team_links enable row level security;

revoke all on public.competitions, public.courtrack_leagues, public.courtrack_team_links from anon, authenticated;

-- ─── Semillas y backfill de la organización actual ('coyotes') ──────────────
do $$
declare
  v_org   constant text := 'coyotes';
  v_podio uuid;
  v_liga  uuid;
begin
  -- Competiciones que ofrecía el formulario hasta ahora.
  insert into public.competitions (org_id, name, kind) values (v_org, 'Liga Podio', 'league') on conflict do nothing;
  insert into public.competitions (org_id, name, kind) values (v_org, 'Amistoso', 'friendly') on conflict do nothing;

  -- Cualquier otro texto que hubiera en matches.competition pasa a ser una competición 'other'.
  insert into public.competitions (org_id, name, kind)
  select v_org, min(m.competition), 'other'
  from public.matches m
  where m.competition is not null
    and length(trim(m.competition)) > 0
    and not exists (
      select 1 from public.competitions c where c.org_id = v_org and lower(c.name) = lower(trim(m.competition))
    )
  group by lower(trim(m.competition));

  update public.matches m
  set competition_id = c.id
  from public.competitions c
  where m.competition_id is null
    and m.competition is not null
    and c.org_id = v_org
    and lower(c.name) = lower(trim(m.competition));

  -- Liga que se sincronizaba por variables de entorno: PODIO (5), liga 605, equipo COYOTES.
  select id into v_podio from public.competitions where org_id = v_org and lower(name) = 'liga podio';

  insert into public.courtrack_leagues (org_id, competition_id, id_cliente, cliente_name, liga_id, liga_name, team_name)
  values (v_org, v_podio, 5, 'PODIO', 605, '+21 Disidencias - NIVEL B - Clausura 2026', 'COYOTES')
  on conflict do nothing;

  select id into v_liga from public.courtrack_leagues where org_id = v_org and liga_id = 605;

  -- Todo lo importado hasta hoy vino de esa liga.
  update public.matches set courtrack_league_id = v_liga where courtrack_id is not null and courtrack_league_id is null;
  update public.sync_log set courtrack_league_id = v_liga where org_id = v_org and courtrack_league_id is null;

  update public.courtrack_leagues l
  set last_synced_at = (select max(started_at) from public.sync_log s where s.courtrack_league_id = l.id and s.status = 'success')
  where l.id = v_liga;
end $$;
