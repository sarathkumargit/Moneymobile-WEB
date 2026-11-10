-- 0029 — Financed-phone IMEI lookup for technicians (Phase 6 of the anti-unlock plan)
--
-- Public page /check: a repair technician types a phone's IMEI and sees only
--   "Financed — contact <shop name> <shop phone>"   or   "Not found".
-- No customer details are ever shown. The answer is signed by the server (Ed25519) so it can't be faked,
-- and tool makers can check the signature with the public key at /api/public/imei-check/key.
--
--   shops.imei_lookup_enabled   shop can switch its phones out of the lookup (default: on)
--   imei_lookup_log             rate limiting + abuse monitoring (hashed IP and IMEI only)
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, the lookup still works
-- (every shop counts as enabled) but without rate limiting.

begin;

alter table public.shops add column if not exists imei_lookup_enabled boolean not null default true;

create table if not exists public.imei_lookup_log (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  imei_hash   text not null,
  financed    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ill_ip on public.imei_lookup_log(ip_hash, created_at desc);
create index if not exists idx_ill_created on public.imei_lookup_log(created_at);

alter table public.imei_lookup_log enable row level security;
drop policy if exists ill_read on public.imei_lookup_log;
create policy ill_read on public.imei_lookup_log for select using (is_super_admin());

commit;

select count(*) as lookups from public.imei_lookup_log;
