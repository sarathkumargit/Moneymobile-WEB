-- ============================================================================
-- MoneyMobile — Installment Management Platform
-- Migration 0001: core schema, multi-tenant RBAC, and Row-Level Security
-- Apply in Supabase: SQL Editor -> paste -> Run   (or `supabase db push`)
-- ============================================================================

-- ---------- Enums -----------------------------------------------------------
create type user_role          as enum ('super_admin', 'shop_admin', 'employee');
create type shop_status         as enum ('active', 'suspended');
create type account_status      as enum ('active', 'disabled');
create type device_status       as enum ('in_stock','reserved','sold','assigned','under_installment','fully_paid','released','returned','servicing','archived');
create type enrollment_status   as enum ('not_enrolled','pending','enrolled','failed');
create type agreement_status    as enum ('draft','active','completed','defaulted','released','cancelled');
create type payment_method      as enum ('cash','bank_transfer','card','mobile_wallet','other');
create type verification_status as enum ('pending','verified','rejected');
create type payment_status      as enum ('pending','partial','paid','overdue');
create type unlock_key_status   as enum ('unused','redeemed','expired','revoked');
create type restriction_status  as enum ('active','restricted','temporarily_unlocked');

-- ---------- Core tenancy: shops + profiles ----------------------------------
create table shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid,                         -- FK added after profiles exists
  phone       text,
  address     text,
  status      shop_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  username    text unique,
  role        user_role not null default 'employee',
  shop_id     uuid references shops(id) on delete set null,  -- null for super_admin
  status      account_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table shops
  add constraint shops_owner_fk foreign key (owner_id) references profiles(id) on delete set null;

-- ---------- Security helper functions (SECURITY DEFINER = bypass RLS) --------
create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_shop_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select shop_id from profiles where id = auth.uid()
$$;

create or replace function is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin')
$$;

-- shop_admin or employee of a given shop (super admin always true)
create or replace function can_access_shop(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_super_admin() or (target is not null and target = auth_shop_id())
$$;

-- ---------- Inventory -------------------------------------------------------
create table phone_models (
  id                       uuid primary key default gen_random_uuid(),
  shop_id                  uuid not null references shops(id) on delete cascade,
  brand                    text not null,
  model_name               text not null,
  variant                  text,
  ram                      text,
  storage                  text,
  color                    text,
  os                       text,
  retail_price             numeric(12,2) default 0,
  default_installment_price numeric(12,2),
  default_deposit          numeric(12,2),
  image_url                text,
  supplier                 text,
  stock_qty                int default 0,
  status                   text default 'active',
  created_by               uuid references profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table customers (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  customer_code       text,
  full_name           text not null,
  national_id         text,
  phone               text,
  email               text,
  address             text,
  date_of_birth       date,
  photo_url           text,
  nic_doc_url         text,
  verification        verification_status default 'pending',
  status              account_status default 'active',
  created_by          uuid references profiles(id),
  assigned_employee_id uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table devices (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  model_id            uuid references phone_models(id) on delete set null,
  brand               text,
  model               text,
  variant             text,
  imei1               text,
  imei2               text,
  serial_number       text,
  color               text,
  storage             text,
  purchase_cost       numeric(12,2),
  retail_price        numeric(12,2),
  supplier            text,
  purchase_date       date,
  warranty            text,
  status              device_status default 'in_stock',
  enrollment          enrollment_status default 'not_enrolled',
  customer_id         uuid references customers(id) on delete set null,
  assigned_employee_id uuid references profiles(id),
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (shop_id, imei1)
);

create table guarantors (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  full_name     text not null,
  national_id   text,
  phone         text,
  address       text,
  relationship  text,
  verification  verification_status default 'pending',
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table customer_guarantors (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  guarantor_id uuid not null references guarantors(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- ---------- Financial -------------------------------------------------------
create table installment_agreements (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  agreement_code      text,
  customer_id         uuid not null references customers(id) on delete restrict,
  device_id           uuid references devices(id) on delete set null,
  total_price         numeric(12,2) not null default 0,
  deposit             numeric(12,2) not null default 0,
  financed_amount     numeric(12,2) not null default 0,
  installment_amount  numeric(12,2) not null default 0,
  frequency           text default 'monthly',
  start_date          date,
  first_due_date      date,
  final_due_date      date,
  grace_days          int default 0,
  outstanding_balance numeric(12,2) not null default 0,
  status              agreement_status default 'active',
  restriction         restriction_status default 'active',
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table installment_schedules (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references installment_agreements(id) on delete cascade,
  shop_id      uuid not null references shops(id) on delete cascade,
  seq          int not null,
  due_date     date not null,
  amount       numeric(12,2) not null default 0,
  paid         numeric(12,2) not null default 0,
  status       payment_status default 'pending',
  created_at   timestamptz not null default now()
);

create table payment_transactions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  agreement_id  uuid references installment_agreements(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  amount        numeric(12,2) not null,
  paid_at       timestamptz not null default now(),
  method        payment_method default 'cash',
  reference     text,
  verification  verification_status default 'pending',
  recorded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- ---------- Device management ----------------------------------------------
create table temporary_unlock_keys (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  device_id     uuid references devices(id) on delete cascade,
  agreement_id  uuid references installment_agreements(id) on delete set null,
  key_hash      text not null,                 -- store a hash, never the plaintext key
  status        unlock_key_status default 'unused',
  expires_at    timestamptz not null,
  redeemed_at   timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table device_assignments (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops(id) on delete cascade,
  device_id         uuid not null references devices(id) on delete cascade,
  previous_employee uuid references profiles(id),
  new_employee      uuid references profiles(id),
  performed_by      uuid references profiles(id),
  reason            text,
  created_at        timestamptz not null default now()
);

-- ---------- Administration --------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid references shops(id) on delete set null,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- Indexes ---------------------------------------------------------
create index on profiles(shop_id);
create index on phone_models(shop_id);
create index on customers(shop_id);
create index on customers(assigned_employee_id);
create index on devices(shop_id);
create index on devices(customer_id);
create index on installment_agreements(shop_id);
create index on installment_agreements(customer_id);
create index on installment_schedules(agreement_id);
create index on payment_transactions(shop_id);
create index on payment_transactions(agreement_id);
create index on temporary_unlock_keys(device_id);
create index on audit_logs(shop_id);

-- ---------- updated_at trigger ---------------------------------------------
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'shops','profiles','phone_models','customers','devices','guarantors',
    'installment_agreements'
  ]) loop
    execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- ---------- Auto-create profile on signup ----------------------------------
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, username, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'username',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee')
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table shops                   enable row level security;
alter table profiles                enable row level security;
alter table phone_models            enable row level security;
alter table customers               enable row level security;
alter table devices                 enable row level security;
alter table guarantors              enable row level security;
alter table customer_guarantors     enable row level security;
alter table installment_agreements  enable row level security;
alter table installment_schedules   enable row level security;
alter table payment_transactions    enable row level security;
alter table temporary_unlock_keys   enable row level security;
alter table device_assignments      enable row level security;
alter table audit_logs              enable row level security;

-- shops: super admin manages all; a shop's members can read their own shop
create policy shops_super_all on shops for all
  using (is_super_admin()) with check (is_super_admin());
create policy shops_member_read on shops for select
  using (id = auth_shop_id());

-- profiles: self read/update; super admin all; shop admin reads own shop's profiles
create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = auth_role()); -- cannot change own role
create policy profiles_super_all on profiles for all
  using (is_super_admin()) with check (is_super_admin());
create policy profiles_shop_admin_read on profiles for select
  using (auth_role() = 'shop_admin' and shop_id = auth_shop_id());

-- Shop-wide readable + writable by shop members (super admin override)
create policy phone_models_access on phone_models for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy guarantors_access on guarantors for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy installment_schedules_access on installment_schedules for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy device_assignments_access on device_assignments for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));

-- customer_guarantors: via parent customer's shop
create policy customer_guarantors_access on customer_guarantors for all
  using (exists (select 1 from customers c where c.id = customer_id and can_access_shop(c.shop_id)))
  with check (exists (select 1 from customers c where c.id = customer_id and can_access_shop(c.shop_id)));

-- customers & devices: shop admin sees all in shop; employee only own-created/assigned
create policy customers_access on customers for all
  using (
    is_super_admin()
    or (shop_id = auth_shop_id() and (auth_role() = 'shop_admin'
        or created_by = auth.uid() or assigned_employee_id = auth.uid()))
  )
  with check (shop_id = auth_shop_id() or is_super_admin());

create policy devices_access on devices for all
  using (
    is_super_admin()
    or (shop_id = auth_shop_id() and (auth_role() = 'shop_admin'
        or created_by = auth.uid() or assigned_employee_id = auth.uid()))
  )
  with check (shop_id = auth_shop_id() or is_super_admin());

-- agreements, payments, unlock keys: shop-scoped read; writes stay inside shop
create policy agreements_access on installment_agreements for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy payments_access on payment_transactions for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));
create policy unlock_keys_access on temporary_unlock_keys for all
  using (can_access_shop(shop_id)) with check (can_access_shop(shop_id));

-- audit logs: readable within shop / super admin; inserts allowed for shop members
create policy audit_read on audit_logs for select using (can_access_shop(shop_id));
create policy audit_insert on audit_logs for insert with check (can_access_shop(shop_id) or is_super_admin());

-- NOTE: finer per-employee permissions (member_permissions: who can record payments,
-- release devices, view NIC docs, etc.) are layered on in a later migration.
