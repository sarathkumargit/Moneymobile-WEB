-- Last-known location per device (updated on every heartbeat) + a small history trail.
alter table device_enrollments
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision,
  add column if not exists location_accuracy int,
  add column if not exists location_at timestamptz;

create table if not exists device_locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  enrollment_id uuid references device_enrollments(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  accuracy int,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_device_locations_enr on device_locations(enrollment_id, recorded_at desc);
alter table device_locations enable row level security;
create policy dl_access on device_locations for all using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
