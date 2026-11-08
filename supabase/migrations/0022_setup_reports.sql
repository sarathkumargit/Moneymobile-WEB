-- 0022 — Setup reports (app 1.10.8+)
--
-- A phone being set up (QR or USB) sends a short report: model, Android version, whether the app became
-- Device Owner / registered / can read the IMEI, the setup steps it reached and any app crash. Shown on
-- Device Mgmt -> "Setup reports" so a phone that fails to set up on any brand shows WHY.
-- Written only by the server (/api/devices/setup-report, service role) after checking the shop's
-- enroll secret. Holds no secrets.
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, reports are refused
-- quietly and the Device Mgmt card stays hidden; nothing else changes.

create table if not exists public.device_setup_reports (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  stage           text not null check (stage in ('provisioning', 'crash', 'enrolled')),
  brand           text,
  model           text,
  android_version text,
  sdk_int         int,
  app_version     text,
  device_owner    boolean not null default false,
  enrolled        boolean not null default false,
  imei_readable   boolean not null default false,
  steps           text,
  crash           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_dsr_shop on public.device_setup_reports(shop_id, created_at desc);

alter table public.device_setup_reports enable row level security;
drop policy if exists dsr_read on public.device_setup_reports;
create policy dsr_read on public.device_setup_reports for select
  using (can_access_shop(shop_id));
