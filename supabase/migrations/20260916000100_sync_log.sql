-- ════════════════════════════════════════════════════════════════════════════
-- sync_log: cada sincronización con CourtTrack (microservicio courtrack-service).
-- Sirve de historial y para el límite de syncs por organización en 24 h:
-- el servicio inserta la fila en `running` antes de empezar y cuenta las de la ventana.
-- ════════════════════════════════════════════════════════════════════════════

create table public.sync_log (
  id          uuid primary key default gen_random_uuid(),
  -- Organización/equipo que sincroniza (hoy solo 'coyotes'; preparado para varios)
  org_id      text not null,
  -- Origen de los datos ('courtrack')
  source      text not null default 'courtrack',
  -- running → success | error. rejected = superó el cupo (no cuenta para el límite)
  status      text not null default 'running',
  dry_run     boolean not null default false,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- Resumen: {"scanned", "own", "created", "updated", "adopted", "unchanged", "skipped", "rivals_created"}
  result      jsonb,
  error       text,
  constraint sync_log_org_not_blank check (length(trim(org_id)) > 0),
  constraint sync_log_status_check check (status in ('running', 'success', 'error', 'rejected'))
);

create index sync_log_window_idx on public.sync_log (org_id, source, started_at desc);

-- ─── Seguridad: solo el backend accede ──────────────────────────────────────
alter table public.sync_log enable row level security;
revoke all on public.sync_log from anon, authenticated;
