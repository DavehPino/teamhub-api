-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tenant, fase 1: organizaciones y membresías. MIGRACIÓN ADITIVA.
--
-- Hasta ahora el backend servía a un solo equipo por deploy (variable ORG_ID) y
-- solo 4 tablas tenían org_id (texto). Aquí nace la tabla `organizations` y todas
-- las tablas de datos pasan a pertenecer a una organización.
--
-- Es aditiva a propósito: no cambia tipos ni unicidades existentes, y las columnas
-- nuevas llevan DEFAULT = organización 'coyotes', de modo que el API desplegado
-- (que aún no envía la organización) sigue insertando sin cambios. La fase 2
-- (junto con el código) quita esos defaults, pasa las unicidades globales a
-- por-organización y sustituye los org_id de texto por FK uuid.
--
-- Acceso: solo el backend (clave secreta). RLS activo sin políticas.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── organizations: un club/equipo por fila ─────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  -- Identificador legible: lo envía la app móvil en el header x-org-slug
  slug       text not null unique,
  name       text not null,
  -- Tema para la app móvil: {"primary": "#...", "accent": "#...", "logo_url": "..."}
  theme      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_theme_object check (jsonb_typeof(theme) = 'object')
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ─── org_members: quién administra cada organización (Supabase Auth) ────────
-- Los invitados (solo lectura) no necesitan cuenta: no aparecen aquí.
create table public.org_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- 'admin' = todo, incluidos miembros | 'coach' = escritura de datos deportivos
  role       text not null default 'coach',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  constraint org_members_role_check check (role in ('admin', 'coach'))
);

create index org_members_user_idx on public.org_members (user_id);

-- ─── Organización por defecto: 'coyotes' ────────────────────────────────────
insert into public.organizations (slug, name) values ('coyotes', 'Coyotes');

-- Devuelve el id de la organización por defecto. Se usa como DEFAULT de las
-- columnas org_id mientras el API no envíe la organización (se elimina en la fase 2).
create function public.default_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.organizations where slug = 'coyotes'
$$;

-- ─── Tablas de datos sin organización: columna + backfill + NOT NULL ────────
-- Patrón por tabla: columna con DEFAULT (rellena las filas existentes con 'coyotes'),
-- NOT NULL, FK e índice. lineup_players hereda la organización de su formación.
alter table public.teams             add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;
alter table public.weekly_activities add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;
alter table public.videos            add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;
alter table public.matches           add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;
alter table public.players           add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;
alter table public.lineups           add column org_id uuid not null default public.default_org_id() references public.organizations (id) on delete cascade;

create index teams_org_idx             on public.teams (org_id);
create index weekly_activities_org_idx on public.weekly_activities (org_id, activity_date);
create index videos_org_idx            on public.videos (org_id);
create index matches_org_idx           on public.matches (org_id, played_on desc);
create index players_org_idx           on public.players (org_id);
create index lineups_org_idx           on public.lineups (org_id);

-- ─── Tablas con org_id de texto: FK uuid paralela ───────────────────────────
-- El org_id de texto (slug) se conserva hasta la fase 2, cuando el código pase a
-- la FK y se renombre organization_id → org_id. Si algún org_id de texto no
-- corresponde a una organización, el NOT NULL falla y la migración se aborta.
alter table public.competitions         add column organization_id uuid references public.organizations (id) on delete cascade;
alter table public.courtrack_leagues    add column organization_id uuid references public.organizations (id) on delete cascade;
alter table public.courtrack_team_links add column organization_id uuid references public.organizations (id) on delete cascade;
alter table public.sync_log             add column organization_id uuid references public.organizations (id) on delete cascade;

update public.competitions t         set organization_id = o.id from public.organizations o where o.slug = t.org_id;
update public.courtrack_leagues t    set organization_id = o.id from public.organizations o where o.slug = t.org_id;
update public.courtrack_team_links t set organization_id = o.id from public.organizations o where o.slug = t.org_id;
update public.sync_log t             set organization_id = o.id from public.organizations o where o.slug = t.org_id;

-- Las filas que el código actual siga insertando (solo con org_id de texto) quedan
-- vinculadas a la organización por defecto hasta que el código use la FK.
alter table public.competitions         alter column organization_id set default public.default_org_id();
alter table public.courtrack_leagues    alter column organization_id set default public.default_org_id();
alter table public.courtrack_team_links alter column organization_id set default public.default_org_id();
alter table public.sync_log             alter column organization_id set default public.default_org_id();

alter table public.competitions         alter column organization_id set not null;
alter table public.courtrack_leagues    alter column organization_id set not null;
alter table public.courtrack_team_links alter column organization_id set not null;
alter table public.sync_log             alter column organization_id set not null;

create index competitions_organization_idx         on public.competitions (organization_id);
create index courtrack_leagues_organization_idx    on public.courtrack_leagues (organization_id);
create index courtrack_team_links_organization_idx on public.courtrack_team_links (organization_id);
create index sync_log_organization_idx             on public.sync_log (organization_id, started_at desc);

-- ─── Seguridad: solo el backend accede ──────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;

revoke all on public.organizations, public.org_members from anon, authenticated;
-- default_org_id() conserva su EXECUTE público a propósito: se evalúa como DEFAULT
-- en cada INSERT con el rol que escribe (service_role) y solo devuelve un id.
