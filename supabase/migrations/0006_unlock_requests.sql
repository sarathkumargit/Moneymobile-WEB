-- Customer-initiated unlock requests, raised from the phone's Unlock button and
-- actioned by staff on the Unlock Requests page.
create table if not exists device_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  enrollment_id uuid references device_enrollments(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  agreement_id uuid references installment_agreements(id) on delete set null,
  imei text,
  model text,
  customer_name text,
  reason text,
  status text not null default 'pending',   -- pending | approved | rejected
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz
);
create index if not exists idx_unlock_requests_shop on device_unlock_requests(shop_id);
create index if not exists idx_unlock_requests_status on device_unlock_requests(status);

alter table device_unlock_requests enable row level security;
create policy dur_access on device_unlock_requests
  for all using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
