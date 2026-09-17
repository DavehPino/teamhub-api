-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza: la competición del partido vive en matches.competition_id
-- (tabla competitions) desde 20260917000000. Ni el dashboard ni el
-- microservicio courtrack-service leen o escriben ya el texto libre.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.matches drop column competition;
