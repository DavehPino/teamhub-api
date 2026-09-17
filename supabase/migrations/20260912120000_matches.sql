-- ════════════════════════════════════════════════════════════════════════════
-- Partidos como entidad propia. Los videos se cuelgan de un partido.
-- Sustituye video_teams y los campos de partido que había en videos.
-- ════════════════════════════════════════════════════════════════════════════

create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  -- Identificador legible para la URL y para la carpeta del bucket:
  --   videos/partidos/<slug>/...  →  p.ej. 2026-09-10-vs-pumas
  slug             text not null unique,
  played_on        date not null,
  start_time       time,
  opponent_team_id uuid not null references public.teams (id) on delete restrict,
  is_home          boolean not null default true,
  location         text,
  competition      text,
  -- Fase o jornada: "Fecha 3", "Semifinal"...
  phase            text,
  sets_won         smallint,
  sets_lost        smallint,
  -- Parciales en orden: [{"us": 25, "them": 20}, {"us": 22, "them": 25}, ...]
  set_scores       jsonb not null default '[]'::jsonb,
  summary          text,
  cover_image_url  text,
  activity_id      uuid references public.weekly_activities (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint matches_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint matches_sets_range check (
    (sets_won is null or sets_won between 0 and 5)
    and (sets_lost is null or sets_lost between 0 and 5)
  ),
  constraint matches_set_scores_array check (jsonb_typeof(set_scores) = 'array')
);

create index matches_played_on_idx on public.matches (played_on desc);
create index matches_opponent_idx on public.matches (opponent_team_id);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ─── videos: vínculo con partido y orden dentro del partido ─────────────────
alter table public.videos
  add column match_id   uuid references public.matches (id) on delete set null,
  -- Set al que corresponde el video (null = partido completo, resumen, etc.)
  add column set_number smallint,
  add column sort_order integer not null default 0,
  add constraint videos_set_number_range check (set_number is null or set_number between 1 and 5);

create index videos_match_idx on public.videos (match_id, set_number, sort_order);

-- Estos datos ahora viven en matches
alter table public.videos
  drop column competition,
  drop column result;

drop table public.video_teams;

-- ─── Seguridad: solo el backend accede ──────────────────────────────────────
alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
