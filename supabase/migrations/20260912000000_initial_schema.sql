-- ════════════════════════════════════════════════════════════════════════════
-- Coyotes Volley — esquema inicial
-- Acceso: SOLO desde el backend (Vercel Functions) con la clave secreta de
-- Supabase. RLS activado sin políticas públicas => anon/authenticated no leen nada.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── updated_at automático ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- teams: equipos (el propio y rivales)
-- ════════════════════════════════════════════════════════════════════════════
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  is_own_team boolean not null default false,
  -- Categoría/división, p.ej. "Mayores Femenino", "Sub-18 Masculino"
  category    text,
  city        text,
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teams_name_not_blank check (length(trim(name)) > 0)
);

create unique index teams_name_category_key
  on public.teams (lower(name), coalesce(lower(category), ''));

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- weekly_activities: actividades concretas de cada semana
-- Fecha + horas locales (sin zona horaria): el equipo opera en una sola ciudad.
-- week_start (lunes) se calcula solo para agrupar/filtrar por semana.
-- ════════════════════════════════════════════════════════════════════════════
create table public.weekly_activities (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  activity_type text not null default 'entrenamiento',
  activity_date date not null,
  -- Lunes de la semana (ISO). extract(isodow) sobre date es inmutable.
  week_start    date generated always as (activity_date - ((extract(isodow from activity_date))::int - 1)) stored,
  start_time    time,
  end_time      time,
  location      text,
  description   text,
  -- Rival/equipo relacionado (partidos, amistosos)
  opponent_team_id uuid references public.teams (id) on delete set null,
  is_cancelled  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint weekly_activities_title_not_blank check (length(trim(title)) > 0),
  constraint weekly_activities_type_check check (
    activity_type in ('entrenamiento', 'partido', 'amistoso', 'torneo', 'fisico', 'video_analisis', 'reunion', 'otro')
  ),
  constraint weekly_activities_time_range check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create index weekly_activities_week_idx on public.weekly_activities (week_start, activity_date, start_time);

create trigger weekly_activities_set_updated_at
  before update on public.weekly_activities
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- videos: metadata de cada video. El archivo vive en el bucket (S3/R2);
-- el sync del backend crea filas nuevas a partir de los objetos del bucket.
-- ════════════════════════════════════════════════════════════════════════════
create table public.videos (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  -- 'bucket' = archivo en nuestro bucket | 'external' = enlace (YouTube, Drive...)
  source           text not null default 'bucket',
  -- Clave del objeto en el bucket (null si source = 'external')
  storage_key      text unique,
  -- URL pública/estable del video. Para buckets privados puede ser null y el
  -- backend genera una URL firmada temporal al reproducir.
  url              text,
  thumbnail_url    text,
  content_type     text,
  size_bytes       bigint,
  duration_seconds integer,
  category         text not null default 'sin_clasificar',
  recorded_on      date,
  competition      text,
  -- Resultado libre, p.ej. "3-1 (25-20, 22-25, 25-18, 25-19)"
  result           text,
  tags             text[] not null default '{}',
  -- 'pending' = llegó por sync y falta completar metadata | 'ready' = catalogado
  status           text not null default 'pending',
  activity_id      uuid references public.weekly_activities (id) on delete set null,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint videos_title_not_blank check (length(trim(title)) > 0),
  constraint videos_source_check check (source in ('bucket', 'external')),
  constraint videos_source_location check (
    (source = 'bucket' and storage_key is not null)
    or (source = 'external' and url is not null)
  ),
  constraint videos_category_check check (
    category in ('partido', 'entrenamiento', 'scouting', 'highlights', 'tecnica', 'tactica', 'sin_clasificar')
  ),
  constraint videos_status_check check (status in ('pending', 'ready', 'archived')),
  constraint videos_size_positive check (size_bytes is null or size_bytes >= 0),
  constraint videos_duration_positive check (duration_seconds is null or duration_seconds >= 0)
);

create index videos_recorded_on_idx on public.videos (recorded_on desc nulls last);
create index videos_status_idx on public.videos (status);
create index videos_category_idx on public.videos (category);
create index videos_activity_idx on public.videos (activity_id);
create index videos_tags_idx on public.videos using gin (tags);

create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- video_teams: equipos involucrados en un video (N:M)
-- ════════════════════════════════════════════════════════════════════════════
create table public.video_teams (
  video_id   uuid not null references public.videos (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  -- 'home' local | 'away' visitante | 'involved' aparece sin rol de local/visitante
  role       text not null default 'involved',
  created_at timestamptz not null default now(),
  primary key (video_id, team_id),
  constraint video_teams_role_check check (role in ('home', 'away', 'involved'))
);

create index video_teams_team_idx on public.video_teams (team_id);

-- ─── Seguridad: RLS activo, sin políticas => solo la clave secreta accede ────
alter table public.teams             enable row level security;
alter table public.weekly_activities enable row level security;
alter table public.videos            enable row level security;
alter table public.video_teams       enable row level security;

revoke all on public.teams, public.weekly_activities, public.videos, public.video_teams from anon, authenticated;
