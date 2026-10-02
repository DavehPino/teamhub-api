-- ════════════════════════════════════════════════════════════════════════════
-- Competición «Amistoso» por defecto en cada club
--
-- Cargar un partido exige una competición (matches.competition_id) y los clubes nuevos nacían sin ninguna: las
-- competiciones solo se creaban al dar de alta una liga de CourtTrack. Un club recién creado desde la app no podía
-- registrar ni un partido. Ahora create_organization crea «Amistoso» (friendly) junto con el equipo propio.
--
-- También se añade a los clubes que ya existen y no tienen ninguna competición. Los que ya tienen alguna no se tocan.
-- ════════════════════════════════════════════════════════════════════════════

-- Misma función que en 20260924000000_onboarding.sql con un insert más. CREATE OR REPLACE conserva los permisos
-- (solo la clave de servicio la ejecuta).
create or replace function public.create_organization(p_user uuid, p_name text, p_slug text)
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
  -- competitions conserva el org_id de texto (slug) que lee courtrack-service y filtra por organization_id.
  insert into public.competitions (org_id, organization_id, name, kind) values (p_slug, v_org, 'Amistoso', 'friendly');
  return v_org;
end;
$$;

-- Clubes existentes sin ninguna competición.
insert into public.competitions (org_id, organization_id, name, kind)
select o.slug, o.id, 'Amistoso', 'friendly'
from public.organizations o
where not exists (select 1 from public.competitions c where c.organization_id = o.id)
on conflict do nothing;
