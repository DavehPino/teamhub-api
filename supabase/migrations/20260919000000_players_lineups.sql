-- ════════════════════════════════════════════════════════════════════════════
-- Alineación: plantel del equipo y formaciones con nombre.
-- Cada jugador tiene una posición principal obligatoria y una secundaria
-- opcional (shared/domain.ts PLAYER_POSITIONS). Una formación guarda dónde está
-- cada jugador en la media cancha propia, con coordenadas normalizadas (0..1)
-- para que se vea igual en cualquier pantalla.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── players: plantel ───────────────────────────────────────────────────────
create table public.players (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  jersey_number      smallint,
  -- 'armador' | 'punta' | 'central' | 'opuesto' | 'libero' | 'comodin'
  primary_position   text not null,
  secondary_position text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint players_name_not_blank check (length(trim(name)) > 0),
  constraint players_jersey_range check (jersey_number is null or jersey_number between 0 and 99),
  constraint players_primary_position_check
    check (primary_position in ('armador', 'punta', 'central', 'opuesto', 'libero', 'comodin')),
  constraint players_secondary_position_check
    check (secondary_position is null
           or secondary_position in ('armador', 'punta', 'central', 'opuesto', 'libero', 'comodin')),
  constraint players_positions_distinct check (secondary_position is distinct from primary_position)
);

-- Número de camiseta único entre jugadores activos.
create unique index players_active_jersey_key on public.players (jersey_number)
  where is_active and jersey_number is not null;

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ─── lineups: formaciones con nombre ────────────────────────────────────────
create table public.lineups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,           -- p. ej. "Titular", "vs Onas"
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lineups_name_not_blank check (length(trim(name)) > 0)
);

-- El nombre identifica la formación en el selector: no se repite (sin distinguir mayúsculas).
create unique index lineups_name_key on public.lineups (lower(trim(name)));

create trigger lineups_set_updated_at
  before update on public.lineups
  for each row execute function public.set_updated_at();

-- ─── lineup_players: jugadores en cancha de cada formación ─────────────────
create table public.lineup_players (
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- Coordenadas normalizadas (0..1) sobre la media cancha: independientes del tamaño de pantalla.
  x numeric(4,3) not null check (x between 0 and 1),
  y numeric(4,3) not null check (y between 0 and 1),
  primary key (lineup_id, player_id)
);

create index lineup_players_player_idx on public.lineup_players (player_id);

-- RLS activado sin políticas: solo el backend (clave secreta) accede.
alter table public.players        enable row level security;
alter table public.lineups        enable row level security;
alter table public.lineup_players enable row level security;
