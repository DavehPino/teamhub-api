-- ════════════════════════════════════════════════════════════════════════════
-- Códigos de invitado: acceso de solo lectura sin cuenta con un código autogenerado de UN SOLO USO.
--
--  · Un administrador genera un código nuevo cada vez que invita a alguien a mirar el club.
--  · Quien lo escribe en la app (o abre el enlace) lo canjea: la primera vez devuelve el club y lo marca como usado;
--    después responde que ya se usó. No caduca mientras no se use.
--  · Distinto de org_invites (códigos para unirse como miembro, con cuenta y rol).
--
-- Importante: el código controla la INVITACIÓN, no la lectura. Las lecturas del backend siguen siendo públicas por slug
-- (las usa la web pública del club); quien conozca el slug de un club puede leer sus datos igualmente.
--
-- Acceso: solo el backend (clave secreta). RLS activo sin políticas.
-- ════════════════════════════════════════════════════════════════════════════

create table public.org_guest_codes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- Código que se comparte, p. ej. K7QMX2 (6 caracteres, sin 0/O ni 1/I/L). Único en toda la base.
  code       text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- null = todavía sin usar
  used_at    timestamptz,
  constraint org_guest_codes_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create index org_guest_codes_org_idx on public.org_guest_codes (org_id, created_at desc);

alter table public.org_guest_codes enable row level security;
revoke all on public.org_guest_codes from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- redeem_guest_code: canjea el código (todo o nada) y devuelve el club al que da acceso.
-- Bloquea la fila: dos personas con el mismo código a la vez no pueden entrar las dos.
-- Errores (mensaje = código que traduce el backend): guest_code_invalid · guest_code_used
-- ════════════════════════════════════════════════════════════════════════════
create function public.redeem_guest_code(p_code text)
returns table (slug text, name text)
language plpgsql
set search_path = ''
as $$
declare
  v_code public.org_guest_codes%rowtype;
begin
  select * into v_code from public.org_guest_codes where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'guest_code_invalid';
  end if;
  if v_code.used_at is not null then
    raise exception 'guest_code_used';
  end if;

  update public.org_guest_codes set used_at = now() where id = v_code.id;

  return query select o.slug, o.name from public.organizations o where o.id = v_code.org_id;
end;
$$;

revoke all on function public.redeem_guest_code(text) from public, anon, authenticated;
grant execute on function public.redeem_guest_code(text) to service_role;
