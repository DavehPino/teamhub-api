-- ════════════════════════════════════════════════════════════════════════════
-- Onboarding de organizaciones y miembros.
--
--  · org_creators: quién puede crear clubes. Hoy lo concede el dueño del servicio (scripts/org-admin.mjs); cuando exista
--    la pasarela de pago, su webhook escribirá aquí. `max_orgs` es cuántos clubes puede crear esa cuenta.
--  · org_invites: códigos para unirse a un club. No caducan, se pueden usar N veces (o ilimitadas) y se pueden revocar.
--  · Funciones atómicas (el cliente de Supabase no tiene transacciones): crear club, usar una invitación, quitar un
--    miembro y cambiar su rol sin dejar el club sin administradores.
--
-- Acceso: solo el backend (clave secreta). RLS activo sin políticas.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Quién creó cada club (para contar el cupo de max_orgs) ─────────────────
alter table public.organizations
  add column created_by uuid references auth.users (id) on delete set null;

-- ─── org_creators: cuentas autorizadas a crear clubes ───────────────────────
create table public.org_creators (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  max_orgs   integer not null default 1,
  -- Libre: 'cuenta de prueba', id del pago, etc.
  note       text,
  created_at timestamptz not null default now(),
  constraint org_creators_max_orgs_check check (max_orgs >= 1)
);

-- ─── org_invites: códigos de invitación ─────────────────────────────────────
create table public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- Código que se comparte, p. ej. K7QMX2PA (se muestra como K7QM-X2PA). Único en toda la base.
  code       text not null unique,
  -- Rol que recibe quien se une con este código
  role       text not null default 'coach',
  -- null = sin límite de usos
  max_uses   integer,
  uses       integer not null default 0,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint org_invites_role_check check (role in ('admin', 'coach')),
  constraint org_invites_code_format check (code ~ '^[A-Z0-9]{8}$'),
  constraint org_invites_max_uses_check check (max_uses is null or max_uses >= 1),
  constraint org_invites_uses_check check (uses >= 0 and (max_uses is null or uses <= max_uses))
);

create index org_invites_org_idx on public.org_invites (org_id, created_at desc);

-- ─── Seguridad: solo el backend accede ──────────────────────────────────────
alter table public.org_creators enable row level security;
alter table public.org_invites  enable row level security;
revoke all on public.org_creators, public.org_invites from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- create_organization: crea el club, su equipo propio y hace admin a quien lo crea, todo o nada.
-- Errores (mensaje = código que traduce el backend): plan_required · org_limit_reached · slug_taken
-- ════════════════════════════════════════════════════════════════════════════
create function public.create_organization(p_user uuid, p_name text, p_slug text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_max  integer;
  v_used integer;
  v_org  uuid;
begin
  -- Bloquea la fila del permiso: dos altas simultáneas de la misma cuenta se serializan y el tope se respeta.
  select max_orgs into v_max from public.org_creators where user_id = p_user for update;
  if v_max is null then
    raise exception 'plan_required';
  end if;

  select count(*) into v_used from public.organizations where created_by = p_user;
  if v_used >= v_max then
    raise exception 'org_limit_reached';
  end if;

  begin
    insert into public.organizations (slug, name, created_by) values (p_slug, trim(p_name), p_user)
    returning id into v_org;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;

  insert into public.teams (org_id, name, is_own_team) values (v_org, trim(p_name), true);
  insert into public.org_members (org_id, user_id, role) values (v_org, p_user, 'admin');
  return v_org;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- accept_org_invite: une a p_user al club del código y consume un uso, todo o nada.
-- Si ya es miembro no consume ni cambia su rol. Errores: invite_invalid · invite_exhausted
-- ════════════════════════════════════════════════════════════════════════════
create function public.accept_org_invite(p_code text, p_user uuid)
returns table (org_id uuid, slug text, name text, role text, already_member boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_invite public.org_invites%rowtype;
  v_member public.org_members%rowtype;
begin
  -- Bloquea la invitación: con el último uso libre, dos personas a la vez no pueden entrar las dos.
  select * into v_invite from public.org_invites where code = upper(trim(p_code)) for update;
  if not found or v_invite.revoked_at is not null then
    raise exception 'invite_invalid';
  end if;

  select * into v_member from public.org_members m where m.org_id = v_invite.org_id and m.user_id = p_user;
  if found then
    return query select o.id, o.slug, o.name, v_member.role, true from public.organizations o where o.id = v_invite.org_id;
    return;
  end if;

  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted';
  end if;

  insert into public.org_members (org_id, user_id, role) values (v_invite.org_id, p_user, v_invite.role);
  update public.org_invites set uses = uses + 1 where id = v_invite.id;

  return query select o.id, o.slug, o.name, v_invite.role, false from public.organizations o where o.id = v_invite.org_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- remove_org_member / set_org_member_role: nunca dejan el club sin un administrador.
-- Errores: member_not_found · last_admin
-- ════════════════════════════════════════════════════════════════════════════
create function public.remove_org_member(p_org uuid, p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_role   text;
  v_admins integer;
begin
  -- Bloquea los miembros del club: dos bajas de los dos últimos administradores a la vez no pueden pasar las dos.
  perform 1 from public.org_members where org_id = p_org for update;
  select role into v_role from public.org_members where org_id = p_org and user_id = p_user;
  if v_role is null then
    raise exception 'member_not_found';
  end if;
  if v_role = 'admin' then
    select count(*) into v_admins from public.org_members where org_id = p_org and role = 'admin';
    if v_admins <= 1 then
      raise exception 'last_admin';
    end if;
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
end;
$$;

create function public.set_org_member_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_role   text;
  v_admins integer;
begin
  if p_role not in ('admin', 'coach') then
    raise exception 'invalid_role';
  end if;
  perform 1 from public.org_members where org_id = p_org for update;
  select role into v_role from public.org_members where org_id = p_org and user_id = p_user;
  if v_role is null then
    raise exception 'member_not_found';
  end if;
  if v_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admins from public.org_members where org_id = p_org and role = 'admin';
    if v_admins <= 1 then
      raise exception 'last_admin';
    end if;
  end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

-- Solo la clave de servicio las ejecuta (el backend ya autenticó al usuario).
revoke all on function public.create_organization(uuid, text, text) from public, anon, authenticated;
revoke all on function public.accept_org_invite(text, uuid)         from public, anon, authenticated;
revoke all on function public.remove_org_member(uuid, uuid)         from public, anon, authenticated;
revoke all on function public.set_org_member_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_organization(uuid, text, text) to service_role;
grant execute on function public.accept_org_invite(text, uuid)         to service_role;
grant execute on function public.remove_org_member(uuid, uuid)         to service_role;
grant execute on function public.set_org_member_role(uuid, uuid, text) to service_role;
