-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tenant, fase 6: endurecimiento.
--
-- 1. Se quitan los DEFAULT de la organización. Existían solo para que el código anterior a la fase 2 siguiera
--    insertando sin enviar la organización; ahora teamhub-api y courtrack-service la envían siempre. Sin default,
--    un alta que olvide la organización falla en vez de caer en silencio en 'coyotes'.
-- 2. delete_organization(): borrado ordenado de una organización con todos sus datos. Un DELETE directo sobre
--    organizations depende del orden en que Postgres dispare las acciones referenciales (matches → teams es RESTRICT):
--    puede funcionar o fallar según el entorno. La función borra los hijos antes que los padres, así que es determinista.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.teams             alter column org_id drop default;
alter table public.weekly_activities alter column org_id drop default;
alter table public.videos            alter column org_id drop default;
alter table public.matches           alter column org_id drop default;
alter table public.players           alter column org_id drop default;
alter table public.lineups           alter column org_id drop default;

alter table public.competitions         alter column organization_id drop default;
alter table public.courtrack_leagues    alter column organization_id drop default;
alter table public.courtrack_team_links alter column organization_id drop default;
alter table public.sync_log             alter column organization_id drop default;

drop function public.default_org_id();

-- ─── Borrado de una organización ────────────────────────────────────────────
-- `p_confirm_slug` tiene que coincidir con el slug de la organización: evita borrar la equivocada por un id mal pegado.
-- NO toca lo que vive fuera de la base: los archivos del bucket (orgs/<slug>/) ni las cuentas de Supabase Auth.
-- Solo la puede ejecutar la clave de servicio.
create function public.delete_organization(p_org uuid, p_confirm_slug text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_slug text;
begin
  select slug into v_slug from public.organizations where id = p_org;
  if v_slug is null then
    raise exception 'La organización % no existe', p_org;
  end if;
  if v_slug is distinct from p_confirm_slug then
    raise exception 'El slug de confirmación no coincide con el de la organización';
  end if;

  -- Hijos antes que padres: matches referencia a teams y competitions con RESTRICT.
  delete from public.videos               where org_id = p_org;
  delete from public.matches              where org_id = p_org;
  delete from public.lineups              where org_id = p_org;  -- lineup_players cae en cascada
  delete from public.weekly_activities    where org_id = p_org;
  delete from public.players              where org_id = p_org;
  delete from public.courtrack_team_links where organization_id = p_org;
  delete from public.courtrack_leagues    where organization_id = p_org;
  delete from public.sync_log             where organization_id = p_org;
  delete from public.competitions         where organization_id = p_org;
  delete from public.teams                where org_id = p_org;
  delete from public.organizations        where id = p_org;      -- org_members cae en cascada
end;
$$;

revoke all on function public.delete_organization(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization(uuid, text) to service_role;
