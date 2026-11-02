-- 0020 — Online app updates (super admin publishes a new MoneyMobile app; staff update phones over the internet)
--
-- app_releases        one row per uploaded app build (APK kept in the private "app-releases" bucket).
--                     uploading -> ready -> testing (only the chosen test shops see it) -> published (all shops)
--                     withdrawn = pulled back; phones that have not started it never get it.
-- device_app_updates  one row per "Update" click for one phone, and how far that phone got.
-- device_enrollments.app_version_code   the app build number the phone reports on every check-in.
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, the website and
-- the phones work exactly as before; the App updates screens just say the migration is missing.

create table if not exists public.app_releases (
  id            uuid primary key default gen_random_uuid(),
  version_code  int unique,                    -- read from the APK by the server (null while uploading)
  version_name  text,
  storage_path  text not null,
  sha256        text,                          -- computed by the server from the uploaded file
  size_bytes    bigint,
  notes         text,
  status        text not null default 'uploading', -- uploading | ready | testing | published | withdrawn
  test_shop_ids uuid[] not null default '{}',
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

alter table public.app_releases enable row level security;
drop policy if exists ar_super_all on public.app_releases;
create policy ar_super_all on public.app_releases for all
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists ar_shop_read on public.app_releases;
create policy ar_shop_read on public.app_releases for select
  using (status = 'published' or (status = 'testing' and auth_shop_id() = any(test_shop_ids)));

create table if not exists public.device_app_updates (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  enrollment_id uuid not null references public.device_enrollments(id) on delete cascade,
  release_id    uuid not null references public.app_releases(id) on delete cascade,
  status        text not null default 'pending', -- pending | sent | downloading | waiting | installing | installed | failed | cancelled
  detail        text,
  requested_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  finished_at   timestamptz
);
create index if not exists idx_dau_enrollment on public.device_app_updates(enrollment_id, created_at desc);
create index if not exists idx_dau_shop on public.device_app_updates(shop_id, created_at desc);
create index if not exists idx_dau_release on public.device_app_updates(release_id);

alter table public.device_app_updates enable row level security;
drop policy if exists dau_access on public.device_app_updates;
create policy dau_access on public.device_app_updates for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));

alter table public.device_enrollments add column if not exists app_version_code int;

-- Private bucket for the app files. Uploaded through a one-time signed upload link made by the server;
-- phones download through short-lived signed links. No public access.
insert into storage.buckets (id, name, public)
values ('app-releases', 'app-releases', false)
on conflict (id) do nothing;
