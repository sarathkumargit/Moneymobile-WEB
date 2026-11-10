-- 0025 — Model protection tests + risk verdicts (Phase 1 of the anti-unlock plan)
--
-- The shop tests each phone model with its own unlock / flash tools and records the result here.
-- The website turns the results into a risk level per model (safe / risky / untested / not allowed)
-- and shows it when an agreement is created. "Not allowed" models can only be financed by the shop
-- owner with a written reason (kept in the audit log).
--
--   model_protection_tests     one row per test (shop's own; shop_id null = platform test by super admin)
--   model_protection_verdicts  optional platform-wide verdict per model, set by the super admin
--
-- model_key = brand + model, lower-case, spaces removed ("samsung|sm-m175f"), so "Samsung SM-M175F"
-- and "samsung sm-m175f" match. The website computes the same key (src/lib/devices/model-risk.ts).
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, the website treats
-- every model as "untested" and blocks nothing.

begin;

create table if not exists public.model_protection_tests (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid references public.shops(id) on delete cascade,
  brand            text not null,
  model            text not null,
  model_key        text generated always as (
                     lower(regexp_replace(brand, '\s', '', 'g')) || '|' || lower(regexp_replace(model, '\s', '', 'g'))
                   ) stored,
  android_version  text,
  security_patch   date,
  method           text not null check (method in ('recovery_reset', 'frp_tool', 'firmware_flash', 'mdm_tool', 'other')),
  tool_name        text,
  tool_version     text,
  result           text not null check (result in ('held', 'bypassed')),
  notes            text,
  photo_path       text,
  tested_at        timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_mpt_shop_model on public.model_protection_tests(shop_id, model_key, tested_at desc);
create index if not exists idx_mpt_model on public.model_protection_tests(model_key, tested_at desc);

create table if not exists public.model_protection_verdicts (
  model_key   text primary key,
  brand       text not null,
  model       text not null,
  verdict     text not null check (verdict in ('safe', 'risky', 'not_allowed')),
  reason      text,
  set_by      uuid references auth.users(id) on delete set null,
  set_at      timestamptz not null default now()
);

alter table public.model_protection_tests enable row level security;
drop policy if exists mpt_read on public.model_protection_tests;
create policy mpt_read on public.model_protection_tests for select
  using (is_super_admin() or (shop_id is not null and can_access_shop(shop_id)));
-- Writes go through the website's server code (service role) after a role check.

alter table public.model_protection_verdicts enable row level security;
drop policy if exists mpv_read on public.model_protection_verdicts;
create policy mpv_read on public.model_protection_verdicts for select
  using (auth.uid() is not null);

commit;

select 'model_protection_tests' as table_name, count(*) as rows from public.model_protection_tests
union all
select 'model_protection_verdicts', count(*) from public.model_protection_verdicts;
