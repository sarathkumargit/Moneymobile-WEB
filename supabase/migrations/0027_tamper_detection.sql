-- 0027 — Tamper detection and alerts (Phase 3 of the anti-unlock plan)
--
-- The website watches for signs that a financed phone is being reset, flashed or tampered with:
--   silent for too long, check-in signature missing / wrong / replayed, hardware key replaced or lost,
--   bootloader unlocked, firmware not verified, USB debugging / developer options on,
--   phone registered again (it was wiped), attestation not from Google.
-- Each sign is a row here with points; the phone's score = points of its open alerts (last 30 days, max 100).
-- Staff see them on Tamper Alerts. A shop can also choose to lock the phone automatically when the score
-- reaches its threshold (off by default).
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, signs are not recorded
-- and nothing else changes.

begin;

create table if not exists public.device_tamper_events (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  enrollment_id      uuid references public.device_enrollments(id) on delete set null,
  device_id          uuid references public.devices(id) on delete set null,
  agreement_id       uuid references public.installment_agreements(id) on delete set null,
  rule               text not null,
  severity           text not null check (severity in ('low', 'medium', 'high', 'critical')),
  points             int not null default 0 check (points between 0 and 100),
  details            jsonb not null default '{}'::jsonb,
  status             text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  dedupe_key         text,
  occurrences        int not null default 1,
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users(id) on delete set null,
  resolution_note    text,
  action_taken       text
);

-- One OPEN alert per phone + rule; a repeat just bumps occurrences / last_seen_at.
create unique index if not exists dte_open_dedupe on public.device_tamper_events(dedupe_key) where status in ('open', 'acknowledged');
create index if not exists idx_dte_shop on public.device_tamper_events(shop_id, status, created_at desc);
create index if not exists idx_dte_enr on public.device_tamper_events(enrollment_id, status);

alter table public.device_enrollments add column if not exists tamper_score      int not null default 0;
alter table public.device_enrollments add column if not exists tamper_scored_at  timestamptz;

alter table public.shops add column if not exists tamper_auto_lock       boolean not null default false;
alter table public.shops add column if not exists tamper_lock_threshold  int not null default 60 check (tamper_lock_threshold between 20 and 100);
alter table public.shops add column if not exists strict_usb             boolean not null default true;  -- app 1.11.0+: USB debugging + file transfer blocked at all times
alter table public.device_enrollments add column if not exists usb_service_until timestamptz;            -- staff "Allow USB service for 30 min"

alter table public.device_tamper_events enable row level security;
drop policy if exists dte_read on public.device_tamper_events;
create policy dte_read on public.device_tamper_events for select
  using (can_access_shop(shop_id));
-- Written by the server (service role). Staff resolve alerts through the website's server actions.

commit;

select 'device_tamper_events' as table_name, count(*) as rows from public.device_tamper_events;
