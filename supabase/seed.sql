-- ════════════════════════════════════════════════════════════════════════════
-- Datos de ejemplo para desarrollo: equipo propio, 3 rivales, dos semanas de
-- actividades (la actual y la siguiente) y 4 partidos pasados con parciales.
--
-- Se puede ejecutar varias veces sin duplicar filas:
--   · local:  supabase db reset   (aplica migraciones + este seed)
--   · remoto: pegar en el SQL Editor de Supabase
-- Las actividades se generan relativas a la semana en curso (lunes ISO).
-- Todo pertenece a la organización 'coyotes', que crea la migración 20260920000000_organizations.sql.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_monday    date := date_trunc('week', current_date)::date; -- lunes de esta semana
  v_next      date := v_monday + 7;
  v_onas      uuid;
  v_pumas     uuid;
  v_halcones  uuid;
  v_match     uuid;
  v_lineup    uuid;
  v_org       uuid;
begin
  select id into v_org from public.organizations where slug = 'coyotes';
  if v_org is null then raise exception 'Falta la organización coyotes (la crea la migración de organizaciones)'; end if;

  -- ─── Equipos ──────────────────────────────────────────────────────────────
  insert into public.teams (org_id, name, short_name, is_own_team, category, city)
  select v_org, 'Coyotes', 'COY', true, 'Mayores', 'Ciudad'
  where not exists (select 1 from public.teams where org_id = v_org and is_own_team);

  insert into public.teams (org_id, name, short_name, category, city)
  select v_org, 'Onas Vóley', 'ONA', 'Mayores', 'Ciudad'
  where not exists (select 1 from public.teams where org_id = v_org and lower(name) = 'onas vóley');

  insert into public.teams (org_id, name, short_name, category, city)
  select v_org, 'Pumas', 'PUM', 'Mayores', 'Villa Norte'
  where not exists (select 1 from public.teams where org_id = v_org and lower(name) = 'pumas');

  insert into public.teams (org_id, name, short_name, category, city)
  select v_org, 'Halcones', 'HAL', 'Mayores', 'San Martín'
  where not exists (select 1 from public.teams where org_id = v_org and lower(name) = 'halcones');

  select id into v_onas     from public.teams where org_id = v_org and lower(name) = 'onas vóley' limit 1;
  select id into v_pumas    from public.teams where org_id = v_org and lower(name) = 'pumas' limit 1;
  select id into v_halcones from public.teams where org_id = v_org and lower(name) = 'halcones' limit 1;

  -- ─── Actividades: semana actual ───────────────────────────────────────────
  if not exists (select 1 from public.weekly_activities where org_id = v_org and activity_date between v_monday and v_monday + 6) then
    insert into public.weekly_activities
      (org_id, title, activity_type, activity_date, start_time, end_time, location, description, opponent_team_id, is_cancelled)
    values
      (v_org, 'Entrenamiento técnico', 'entrenamiento', v_monday, '19:30', '21:00', 'Polideportivo Municipal',
       E'Recepción y defensa en W.\nTraer rodilleras.', null, false),
      (v_org, 'Preparación física', 'fisico', v_monday + 1, '20:00', '21:00', 'Gimnasio Norte',
       'Circuito de fuerza y pliometría. Ropa cómoda y botella de agua.', null, false),
      (v_org, 'Entrenamiento', 'entrenamiento', v_monday + 2, '19:30', '21:00', 'Polideportivo Municipal',
       'Sistemas de ataque y bloqueo. Seis contra seis al final.', null, false),
      (v_org, 'Análisis de video: Pumas', 'video_analisis', v_monday + 3, '20:00', '21:00', 'Sala de reuniones del club',
       'Repasamos el último partido contra Pumas: rotaciones y saque.', v_pumas, false),
      (v_org, 'Entrenamiento', 'entrenamiento', v_monday + 4, '19:30', '21:00', 'Polideportivo Municipal',
       'Cancelado por mantenimiento de la cancha.', null, true),
      (v_org, 'Partido vs Pumas', 'partido', v_monday + 5, '18:00', '20:00', 'Polideportivo Municipal',
       E'Jornada 5 de la Liga Regional.\nConcentración a las 17:00. Camiseta negra.', v_pumas, false),
      (v_org, 'Reunión de equipo', 'reunion', v_monday + 6, null, null, null,
       'Balance de la primera vuelta y calendario de la segunda. Hora por confirmar.', null, false);
  end if;

  -- ─── Actividades: semana siguiente ────────────────────────────────────────
  if not exists (select 1 from public.weekly_activities where org_id = v_org and activity_date between v_next and v_next + 6) then
    insert into public.weekly_activities
      (org_id, title, activity_type, activity_date, start_time, end_time, location, description, opponent_team_id, is_cancelled)
    values
      (v_org, 'Entrenamiento', 'entrenamiento', v_next, '19:30', '21:00', 'Polideportivo Municipal',
       'Saque y recepción.', null, false),
      (v_org, 'Preparación física', 'fisico', v_next + 1, '20:00', '21:00', 'Gimnasio Norte',
       'Trabajo de core y movilidad.', null, false),
      (v_org, 'Entrenamiento', 'entrenamiento', v_next + 2, '19:30', '21:00', 'Polideportivo Municipal',
       'Defensa y contraataque.', null, false),
      (v_org, 'Amistoso vs Halcones', 'amistoso', v_next + 4, '20:00', '22:00', 'Pabellón San Martín',
       'Amistoso de preparación. Salida en coche a las 19:00 desde el club.', v_halcones, false),
      (v_org, 'Torneo de fin de semana', 'torneo', v_next + 5, '09:00', '18:00', 'Ciudad Deportiva',
       E'Torneo cuadrangular.\nPrimer partido a las 10:00. Llevar comida.', null, false);
  end if;

  -- ─── Competiciones ────────────────────────────────────────────────────────
  insert into public.competitions (org_id, organization_id, name, kind) values ('coyotes', v_org, 'Liga Regional', 'league') on conflict do nothing;
  insert into public.competitions (org_id, organization_id, name, kind) values ('coyotes', v_org, 'Amistoso', 'friendly') on conflict do nothing;

  -- ─── Partidos pasados ─────────────────────────────────────────────────────
  insert into public.matches
    (org_id, slug, played_on, start_time, opponent_team_id, is_home, location, competition_id, phase, sets_won, sets_lost, set_scores, summary)
  select v_org, '2026-09-06-vs-onas', '2026-09-06', '18:00', v_onas, true, 'Polideportivo Municipal',
         (select id from public.competitions where organization_id = v_org and lower(name) = 'liga regional'), 'Jornada 4', 3, 1,
         '[{"us":25,"them":20},{"us":22,"them":25},{"us":25,"them":18},{"us":25,"them":19}]'::jsonb,
         E'Gran partido en casa. Tras perder el segundo set, el equipo ajustó el bloqueo y dominó los dos siguientes.\nDestacó el saque en el cuarto set.'
  where not exists (select 1 from public.matches where org_id = v_org and slug = '2026-09-06-vs-onas');

  insert into public.matches
    (org_id, slug, played_on, start_time, opponent_team_id, is_home, location, competition_id, phase, sets_won, sets_lost, set_scores, summary)
  select v_org, '2026-08-30-vs-pumas', '2026-08-30', '20:00', v_pumas, false, 'Pabellón Villa Norte',
         (select id from public.competitions where organization_id = v_org and lower(name) = 'liga regional'), 'Jornada 3', 1, 3,
         '[{"us":21,"them":25},{"us":25,"them":23},{"us":19,"them":25},{"us":22,"them":25}]'::jsonb,
         'Derrota fuera de casa. Muchos errores de recepción en los sets 3 y 4; lo trabajamos esta semana.'
  where not exists (select 1 from public.matches where org_id = v_org and slug = '2026-08-30-vs-pumas');

  insert into public.matches
    (org_id, slug, played_on, start_time, opponent_team_id, is_home, location, competition_id, phase, sets_won, sets_lost, set_scores, summary)
  select v_org, '2026-08-23-vs-halcones', '2026-08-23', '18:00', v_halcones, true, 'Polideportivo Municipal',
         (select id from public.competitions where organization_id = v_org and lower(name) = 'liga regional'), 'Jornada 2', 3, 2,
         '[{"us":25,"them":22},{"us":23,"them":25},{"us":25,"them":27},{"us":25,"them":17},{"us":15,"them":12}]'::jsonb,
         'Partido a cinco sets resuelto en el tie-break. Gran reacción tras ir 1-2.'
  where not exists (select 1 from public.matches where org_id = v_org and slug = '2026-08-23-vs-halcones');

  insert into public.matches
    (org_id, slug, played_on, start_time, opponent_team_id, is_home, location, competition_id, phase, sets_won, sets_lost, set_scores, summary)
  select v_org, '2026-08-15-vs-onas-amistoso', '2026-08-15', '11:00', v_onas, false, 'Pabellón Onas',
         (select id from public.competitions where organization_id = v_org and lower(name) = 'amistoso'), 'Pretemporada', 3, 0,
         '[{"us":25,"them":15},{"us":25,"them":21},{"us":25,"them":19}]'::jsonb,
         null
  where not exists (select 1 from public.matches where org_id = v_org and slug = '2026-08-15-vs-onas-amistoso');

  -- ─── Videos externos de ejemplo (los del bucket los crea el cron sync-videos) ──
  select id into v_match from public.matches where org_id = v_org and slug = '2026-09-06-vs-onas';

  if v_match is not null and not exists (select 1 from public.videos where match_id = v_match and source = 'external') then
    insert into public.videos
      (org_id, title, description, source, url, category, recorded_on, status, match_id, set_number, sort_order)
    values
      -- Sustituye la URL por el enlace real de YouTube del partido
      (v_org, 'Resumen del partido', 'Highlights subidos a YouTube.', 'external',
       'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'highlights', '2026-09-06', 'ready', v_match, null, 0),
      -- Enlace que no es de YouTube: el dashboard muestra el botón "Abrir video"
      (v_org, 'Set 1 (Drive)', 'Grabación desde la grada.', 'external',
       'https://drive.google.com/file/d/EJEMPLO/view', 'partido', '2026-09-06', 'ready', v_match, 1, 0);
  end if;

  -- ─── Plantel y una formación de ejemplo (Alineación) ─────────────────────
  if not exists (select 1 from public.players where org_id = v_org) then
    insert into public.players (org_id, name, jersey_number, primary_position, secondary_position, is_active)
    values
      (v_org, 'Juan Pérez',     7,  'armador', 'comodin', true),
      (v_org, 'Ana Gómez',      10, 'punta',   null,      true),
      (v_org, 'Lucas Díaz',     4,  'central', null,      true),
      (v_org, 'Sofía Ramos',    12, 'central', 'opuesto', true),
      (v_org, 'Martín López',   9,  'opuesto', 'punta',   true),
      (v_org, 'Valentina Ruiz', 3,  'punta',   'libero',  true),
      (v_org, 'Diego Sosa',     1,  'libero',  null,      true),
      (v_org, 'Camila Torres',  5,  'armador', null,      true),
      (v_org, 'Nicolás Vega',   8,  'comodin', 'central', true),
      (v_org, 'Paula Méndez',   null, 'punta', null,      false);
  end if;

  if not exists (select 1 from public.lineups where org_id = v_org and lower(trim(name)) = 'titular') then
    insert into public.lineups (org_id, name, notes) values (v_org, 'Titular', 'Formación base de ejemplo.')
    returning id into v_lineup;

    -- Coordenadas normalizadas sobre la media cancha (y = 0 es la red).
    insert into public.lineup_players (lineup_id, player_id, x, y)
    select v_lineup, p.id, pos.x, pos.y
    from (values
      (10, 0.167, 0.250),  -- zona 4
      (4,  0.500, 0.250),  -- zona 3
      (7,  0.833, 0.250),  -- zona 2
      (12, 0.167, 0.700),  -- zona 5
      (3,  0.500, 0.750),  -- zona 6
      (9,  0.833, 0.700),  -- zona 1
      (1,  0.300, 0.880)   -- líbero
    ) as pos (jersey, x, y)
    join public.players p on p.org_id = v_org and p.jersey_number = pos.jersey and p.is_active;
  end if;
end $$;
