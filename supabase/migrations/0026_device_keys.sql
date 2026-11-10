-- 0026 — Hardware device keys + signed check-ins (Phase 2 of the anti-unlock plan, app 1.11.0+)
--
-- At registration, app 1.11.0+ creates a signing key inside the phone's secure chip and proves it with
-- Android key attestation (chain checked against Google's roots on the server). Every later check-in is
-- signed with that key. A phone that is reset or reflashed loses the key for good, so it can never pass
-- as the same enrolled phone again; a wrong / missing signature becomes a tamper alert (migration 0027).
--
-- Phones on 1.10.x keep working exactly as before ("legacy": no key, unsigned check-ins).
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, the website skips the
-- key step quietly and phones keep working unsigned.

begin;

create table if not exists public.device_keys (
  id                    uuid primary key default gen_random_uuid(),
  enrollment_id         uuid not null references public.device_enrollments(id) on delete cascade,
  shop_id               uuid not null references public.shops(id) on delete cascade,
  device_id             uuid references public.devices(id) on delete set null,
  status                text not null default 'active' check (status in ('active', 'replaced', 'revoked')),
  public_key_spki       text not null,              -- base64 DER (SubjectPublicKeyInfo)
  key_fp                text not null,              -- sha256 hex of the public key
  trust                 text not null check (trust in ('google', 'untrusted_root', 'invalid')),
  attestation_error     text,
  security_level        text,                       -- strongbox | tee | software | unknown
  attestation_version   int,
  verified_boot_state   text,                       -- verified | self_signed | unverified | failed | unknown
  device_locked         boolean,                    -- bootloader locked (from the secure chip)
  os_version            int,
  os_patch_level        int,
  vendor_patch_level    int,
  boot_patch_level      int,
  app_package_ok        boolean,
  leaf_serial           text,
  revoked               boolean,
  created_at            timestamptz not null default now(),
  replaced_at           timestamptz,
  last_sig_at           timestamptz,
  last_sig_ts           bigint,                     -- newest signed timestamp seen (replay guard)
  sig_ok_count          bigint not null default 0,
  sig_fail_count        bigint not null default 0
);

create unique index if not exists device_keys_one_active on public.device_keys(enrollment_id) where status = 'active';
create index if not exists idx_device_keys_device on public.device_keys(device_id, created_at desc);

alter table public.device_enrollments add column if not exists attest_challenge     text;
alter table public.device_enrollments add column if not exists attest_challenge_at  timestamptz;
alter table public.device_enrollments add column if not exists key_state            text;   -- legacy | pending | active | lost | bad_signature | unsigned
alter table public.device_enrollments add column if not exists verified_boot_state  text;
alter table public.device_enrollments add column if not exists adb_enabled          boolean;
alter table public.device_enrollments add column if not exists dev_options          boolean;

alter table public.device_keys enable row level security;
drop policy if exists dk_read on public.device_keys;
create policy dk_read on public.device_keys for select
  using (can_access_shop(shop_id));
-- Written only by the server (service role) from /api/devices/attest and /api/devices/heartbeat.

commit;

select 'device_keys' as table_name, count(*) as rows from public.device_keys;
