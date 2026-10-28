-- Bridge tables between the web platform and the Android app.
create table device_enrollments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  agreement_id uuid references installment_agreements(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  enroll_token_hash text not null,          -- sha256 of the one-time enrollment token
  device_token_hash text,                   -- sha256 of the long-lived device token issued on enroll
  status text default 'pending',            -- pending | enrolled | revoked
  manufacturer text, model text, imei1 text, serial_number text,
  android_version text, app_version text,
  sim_iccid text, sim_operator text, battery_level int, network_type text,
  last_sync timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table device_commands (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  enrollment_id uuid references device_enrollments(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  command text not null,                    -- LOCK_DEVICE | UNLOCK_DEVICE | ...
  reason text,
  status text default 'pending',            -- pending | sent | acked | failed
  issued_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz, acked_at timestamptz, result text
);
create table device_security_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  enrollment_id uuid references device_enrollments(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  event_type text, details text,
  status text default 'new',                -- new | approval_required | approved | rejected | resolved
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id), resolved_at timestamptz
);
create index on device_enrollments(shop_id);
create index on device_commands(enrollment_id);
create index on device_security_events(shop_id);

alter table device_enrollments enable row level security;
alter table device_commands enable row level security;
alter table device_security_events enable row level security;
create policy de_access  on device_enrollments     for all using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy dc_access  on device_commands         for all using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy dse_access on device_security_events  for all using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
