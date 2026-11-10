-- 0023 — Device identity registry  (DRAFT FOR REVIEW — do not run yet)
--
-- Gives every physical phone ONE permanent platform identity that holds all of its identifiers
-- (IMEI1, IMEI2, serial), so the same phone can no longer be registered twice, or by two shops.
--
--   platform_devices           one row per physical phone, forever (never deleted)
--   device_identifiers         every IMEI / serial that belongs to a phone. An IMEI is UNIQUE platform-wide.
--   device_identity_events     append-only history (claimed, identifier added, re-enrolled, ...)
--   device_identity_conflicts  cases for the super admin (cross-shop claim, split identity, slot change)
--
-- ADDITIVE and safe to run more than once:
--   * No existing row is deleted. Existing phones are linked to the registry (backfill).
--   * Same-shop duplicates of one phone are linked to ONE identity and listed as events; cross-shop clashes
--     are written to device_identity_conflicts and never auto-resolved.
--   * The one stale duplicate enrollment is marked 'replaced' (its token is cleared); nothing is deleted.
--   * Agreement protection and the one-active-enrollment rule come in 0024, after the web update is live.
--
-- Run once in Supabase -> SQL Editor. The whole script is one transaction: if anything fails, nothing changes.

begin;

-- ───────────────────────────── 1. Normalisation helpers ─────────────────────────────

-- Is a 15-digit IMEI valid under the standard check-digit (Luhn) test?
create or replace function public.imei_luhn_ok(p text) returns boolean
language plpgsql immutable as $$
declare s int := 0; d int; i int;
begin
  if p is null or p !~ '^[0-9]{15}$' then return false; end if;
  for i in 1..15 loop
    d := substr(p, 16 - i, 1)::int;
    if i % 2 = 0 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end $$;

-- Any way of writing an IMEI -> its 15-digit form, or NULL when it is not a usable IMEI.
--   16 digits (IMEISV)  -> software-version digits dropped, check digit calculated
--   14 digits           -> check digit calculated
--   15 digits           -> kept AS IS, even if the check digit is wrong (some phones ship non-standard
--                          IMEIs; those are accepted and flagged luhn_ok = false, never merged with another IMEI)
create or replace function public.normalize_imei(p text) returns text
language plpgsql immutable as $$
declare d text; s int := 0; x int; i int;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if length(d) = 16 then d := left(d, 14); end if;
  if length(d) = 14 then
    for i in 1..14 loop
      x := substr(d, 15 - i, 1)::int;
      if i % 2 = 1 then x := x * 2; if x > 9 then x := x - 9; end if; end if;
      s := s + x;
    end loop;
    d := d || ((10 - s % 10) % 10)::text;
  end if;
  if length(d) <> 15 then return null; end if;
  if d ~ '^0+$' or d ~ '^(.)\1+$' then return null; end if;
  return d;
end $$;

-- Serials are only supporting evidence (cloned phones repeat them), so junk values are dropped.
create or replace function public.normalize_serial(p text) returns text
language sql immutable as $$
  select case
    when s is null or length(s) < 4
      or s in ('unknown','null','n/a','none','1234567890','0123456789abcdef','00000000','00000000000')
      or s ~ '^(.)\1+$' then null
    else s end
  from (select lower(btrim(coalesce(p, ''))) as s) t
$$;

-- ───────────────────────────── 2. Registry tables ─────────────────────────────

create table if not exists public.platform_devices (
  id                 uuid primary key default gen_random_uuid(),   -- the permanent "registration ID"
  custodian_shop_id  uuid references public.shops(id) on delete set null,
  created_by_shop_id uuid references public.shops(id) on delete set null,
  status             text not null default 'active' check (status in ('provisional','active','in_review','released')),
  identity_level     text not null default 'declared' check (identity_level in ('verified','declared','provisional')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_platform_devices_custodian on public.platform_devices (custodian_shop_id);

create table if not exists public.device_identifiers (
  id                 uuid primary key default gen_random_uuid(),
  platform_device_id uuid not null references public.platform_devices(id) on delete restrict,
  kind               text not null check (kind in ('imei','serial')),
  slot               smallint check (slot in (1,2)),                 -- IMEI1 / IMEI2; null for serial
  value_norm         text not null,
  luhn_ok            boolean,                                        -- false = non-standard IMEI (kept, flagged)
  state              text not null default 'declared' check (state in ('declared','verified','retired','disputed')),
  source             text not null default 'staff' check (source in ('staff','phone','admin','backfill')),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  retired_at         timestamptz,
  retired_reason     text,
  check (kind <> 'imei' or value_norm ~ '^[0-9]{15}$')
);
-- THE rule: an IMEI belongs to exactly one phone, platform-wide, in any state (retired IMEIs stay reserved).
create unique index if not exists device_identifiers_imei_key on public.device_identifiers (value_norm) where kind = 'imei';
create unique index if not exists device_identifiers_pd_kind_val_key on public.device_identifiers (platform_device_id, kind, value_norm);
-- A phone has at most one active IMEI per slot.
create unique index if not exists device_identifiers_active_slot_key on public.device_identifiers (platform_device_id, slot)
  where kind = 'imei' and slot is not null and state <> 'retired';
create index if not exists idx_device_identifiers_lookup on public.device_identifiers (kind, value_norm);

create table if not exists public.device_identity_events (
  id                 uuid primary key default gen_random_uuid(),
  platform_device_id uuid references public.platform_devices(id) on delete restrict,
  shop_id            uuid references public.shops(id) on delete set null,
  event_type         text not null,
  actor_id           uuid,
  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists idx_identity_events_pd on public.device_identity_events (platform_device_id, created_at desc);

create table if not exists public.device_identity_conflicts (
  id                          uuid primary key default gen_random_uuid(),
  claimant_shop_id            uuid references public.shops(id) on delete set null,
  enrollment_id               uuid,
  device_id                   uuid,
  existing_platform_device_id uuid references public.platform_devices(id) on delete restrict,
  reason                      text not null check (reason in ('cross_shop','split_identity','slot_changed','clone_suspected','backfill')),
  details                     jsonb not null default '{}'::jsonb,
  status                      text not null default 'open' check (status in ('open','resolved','rejected')),
  created_at                  timestamptz not null default now(),
  resolved_by                 uuid,
  resolved_at                 timestamptz,
  resolution                  text
);
create index if not exists idx_identity_conflicts_open on public.device_identity_conflicts (status, created_at desc);

-- Link existing tables to the registry (nullable; filled by the backfill below).
alter table public.devices              add column if not exists platform_device_id uuid references public.platform_devices(id) on delete restrict;
alter table public.device_enrollments   add column if not exists platform_device_id uuid references public.platform_devices(id) on delete restrict;
alter table public.installment_agreements add column if not exists platform_device_id uuid references public.platform_devices(id) on delete restrict;
create index if not exists idx_devices_platform_device       on public.devices (platform_device_id);
create index if not exists idx_enrollments_platform_device   on public.device_enrollments (platform_device_id);
create index if not exists idx_agreements_platform_device    on public.installment_agreements (platform_device_id);

-- Identities and their history are never deleted or rewritten.
create or replace function public.identity_deny_delete() returns trigger language plpgsql as $$
begin raise exception 'Device identities are permanent and cannot be deleted.'; end $$;
create or replace function public.identity_deny_mutation() returns trigger language plpgsql as $$
begin raise exception 'The device identity history is append-only.'; end $$;

drop trigger if exists trg_pd_no_delete on public.platform_devices;
create trigger trg_pd_no_delete before delete on public.platform_devices for each row execute function public.identity_deny_delete();
drop trigger if exists trg_di_no_delete on public.device_identifiers;
create trigger trg_di_no_delete before delete on public.device_identifiers for each row execute function public.identity_deny_delete();
drop trigger if exists trg_die_append_only on public.device_identity_events;
create trigger trg_die_append_only before update or delete on public.device_identity_events for each row execute function public.identity_deny_mutation();

-- ───────────────────────────── 3. Core: register identifiers atomically ─────────────────────────────
-- Used by claim_device() (phones) and by the devices trigger (staff typing an IMEI). One transaction,
-- serialised per IMEI with an advisory lock, so two simultaneous requests cannot both create the phone.
--
--   created      new identity made
--   matched      the phone is already known to THIS shop (new identifiers, if any, were attached)
--   provisional  no usable IMEI yet: identity made / reused with no identifiers
--   conflict     NOT registered: another shop owns it, the IMEIs belong to two identities, or the phone would
--                get a third IMEI (slot_changed). Never auto-resolved.
create or replace function public.register_identity(
  p_shop_id uuid, p_imeis text[], p_serial text, p_source text,
  p_hint_pd uuid default null, p_enrollment_id uuid default null,
  p_device_id uuid default null, p_log_conflict boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  norms text[] := '{}'; raw text; v text; ord int;
  matches uuid[]; pd uuid; cust uuid; existing uuid; reason text; cid uuid;
  to_add text[] := '{}'; added text[] := '{}'; active_cnt int := 0; slot smallint;
  ser text; created boolean := false;
  st text := case when p_source = 'phone' then 'verified' else 'declared' end;
begin
  foreach raw in array coalesce(p_imeis, '{}') loop
    v := public.normalize_imei(raw);
    if v is not null and not (v = any(norms)) then norms := norms || v; end if;
  end loop;
  ser := public.normalize_serial(p_serial);

  for v in select x from unnest(norms) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('imei:' || v, 0));
  end loop;
  if p_hint_pd is not null then perform pg_advisory_xact_lock(hashtextextended('pd:' || p_hint_pd::text, 0)); end if;

  select coalesce(array_agg(distinct platform_device_id), '{}') into matches
    from device_identifiers where kind = 'imei' and value_norm = any(norms);

  if cardinality(matches) > 1 then
    reason := 'split_identity'; existing := matches[1];
  elsif cardinality(matches) = 1 then
    pd := matches[1];
    select custodian_shop_id into cust from platform_devices where id = pd;
    if cust is distinct from p_shop_id then
      reason := 'cross_shop'; existing := pd;
    elsif p_hint_pd is not null and p_hint_pd <> pd then
      reason := 'split_identity'; existing := pd;
    else
      select coalesce(array_agg(x), '{}') into to_add from unnest(norms) x
        where not exists (select 1 from device_identifiers i where i.kind = 'imei' and i.value_norm = x);
      select count(*) into active_cnt from device_identifiers
        where platform_device_id = pd and kind = 'imei' and state <> 'retired';
      if cardinality(to_add) > 0 and active_cnt + cardinality(to_add) > 2 then
        reason := 'slot_changed'; existing := pd;
      end if;
    end if;
  else
    if p_hint_pd is not null then
      select custodian_shop_id into cust from platform_devices where id = p_hint_pd;
      if found and cust is not distinct from p_shop_id then pd := p_hint_pd; end if;
    end if;
    if pd is null then
      insert into platform_devices (custodian_shop_id, created_by_shop_id, status, identity_level)
      values (p_shop_id, p_shop_id,
              case when cardinality(norms) = 0 then 'provisional' else 'active' end,
              case when cardinality(norms) = 0 then 'provisional' when p_source = 'phone' then 'verified' else 'declared' end)
      returning id into pd;
      created := true;
    end if;
    select count(*) into active_cnt from device_identifiers
      where platform_device_id = pd and kind = 'imei' and state <> 'retired';
    to_add := norms;
    if active_cnt + cardinality(to_add) > 2 then
      if created or active_cnt = 0 then
        to_add := to_add[1:greatest(0, 2 - active_cnt)];           -- a brand-new phone: keep the first two
      else
        reason := 'slot_changed'; existing := pd;
      end if;
    end if;
  end if;

  if reason is not null then
    if p_log_conflict then
      insert into device_identity_conflicts (claimant_shop_id, enrollment_id, device_id, existing_platform_device_id, reason, details)
      values (p_shop_id, p_enrollment_id, p_device_id, existing, reason, jsonb_build_object('imeis', to_jsonb(norms), 'source', p_source))
      returning id into cid;
      insert into device_identity_events (platform_device_id, shop_id, event_type, details)
      values (existing, p_shop_id, 'conflict', jsonb_build_object('reason', reason, 'conflict_id', cid));
    end if;
    return jsonb_build_object('result', 'conflict', 'reason', reason, 'conflict_id', cid);
  end if;

  -- attach new identifiers, in the order the phone / staff gave them
  for v, ord in select x, n from unnest(to_add) with ordinality t(x, n) order by n loop
    select min(s)::smallint into slot from generate_series(1, 2) s
      where not exists (select 1 from device_identifiers i
                        where i.platform_device_id = pd and i.kind = 'imei' and i.slot = s and i.state <> 'retired');
    insert into device_identifiers (platform_device_id, kind, slot, value_norm, luhn_ok, state, source)
    values (pd, 'imei', slot, v, public.imei_luhn_ok(v), st, p_source);
    added := added || v;
  end loop;

  update device_identifiers
     set last_seen_at = now(),
         state = case when p_source = 'phone' and state = 'declared' then 'verified' else state end
   where platform_device_id = pd and kind = 'imei' and value_norm = any(norms);

  if ser is not null then
    insert into device_identifiers (platform_device_id, kind, slot, value_norm, state, source)
    values (pd, 'serial', null, ser, st, p_source)
    on conflict (platform_device_id, kind, value_norm) do update set last_seen_at = now();
  end if;

  if cardinality(norms) > 0 then
    update platform_devices
       set status = case when status = 'provisional' then 'active' else status end,
           identity_level = case when p_source = 'phone' then 'verified'
                                 when identity_level = 'provisional' then 'declared' else identity_level end,
           updated_at = now()
     where id = pd;
  end if;

  if created then
    insert into device_identity_events (platform_device_id, shop_id, event_type, details)
    values (pd, p_shop_id, 'claimed', jsonb_build_object('source', p_source, 'imeis', to_jsonb(norms)));
  elsif cardinality(added) > 0 then
    insert into device_identity_events (platform_device_id, shop_id, event_type, details)
    values (pd, p_shop_id, 'identifier_added', jsonb_build_object('source', p_source, 'added', to_jsonb(added)));
  end if;

  return jsonb_build_object(
    'result', case when cardinality(norms) = 0 then 'provisional' when created then 'created' else 'matched' end,
    'platform_device_id', pd, 'added', to_jsonb(added), 'imeis', to_jsonb(norms));
end $$;

-- ───────────────────────────── 4. Phone registration (called by auto-enroll / enroll) ─────────────────────────────
-- Registers the phone's identity AND makes sure this shop has its inventory row. Server-side only.
create or replace function public.claim_device(
  p_shop_id uuid, p_imeis text[], p_serial text, p_brand text, p_model text,
  p_registration_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r jsonb; pd uuid; dev uuid; i1 text; i2 text; known boolean; norms text[];
begin
  r := public.register_identity(p_shop_id, p_imeis, p_serial, 'phone', p_registration_id, null, null, true);
  if r->>'result' = 'conflict' then return r; end if;
  pd := (r->>'platform_device_id')::uuid;
  if r->>'result' = 'provisional' then return r || jsonb_build_object('device_id', null); end if;

  select array(select jsonb_array_elements_text(r->'imeis')) into norms;
  i1 := norms[1]; i2 := norms[2];

  select exists (select 1 from device_enrollments where platform_device_id = pd and last_sync is not null) into known;

  select id into dev from devices where shop_id = p_shop_id and platform_device_id = pd order by created_at limit 1;
  if dev is null then
    insert into devices (shop_id, brand, model, imei1, imei2, serial_number, status, enrollment)
    values (p_shop_id, p_brand, p_model, i1, i2, p_serial, 'in_stock', 'enrolled')
    returning id into dev;
  else
    update devices set brand = p_brand, model = p_model, enrollment = 'enrolled' where id = dev;
    update devices set imei2 = coalesce(
        (select x from unnest(norms) x where x <> public.normalize_imei(devices.imei1) limit 1), imei2)
      where id = dev and imei2 is null;
  end if;

  if known and r->>'result' = 'matched' then
    insert into device_identity_events (platform_device_id, shop_id, event_type, details)
    values (pd, p_shop_id, 'reenrolled', jsonb_build_object('device_id', dev));
  end if;
  return r || jsonb_build_object('device_id', dev);
end $$;

-- ───────────────────────────── 5. Staff entry guard ─────────────────────────────
-- Staff type IMEIs straight into `devices`. This trigger registers them in the registry, so the cross-shop
-- rule also holds for manual entry. A same-shop duplicate of the same phone (any slot) is refused.
create or replace function public.devices_identity_sync() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r jsonb; pd uuid; n1 text; n2 text; o1 text; o2 text;
begin
  n1 := public.normalize_imei(new.imei1); n2 := public.normalize_imei(new.imei2);
  if n1 is null and n2 is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.imei1 is not distinct from old.imei1 and new.imei2 is not distinct from old.imei2
       and new.serial_number is not distinct from old.serial_number then return new; end if;
    o1 := public.normalize_imei(old.imei1); o2 := public.normalize_imei(old.imei2);
    if (o1 is not null and n1 is distinct from o1) or (o2 is not null and n2 is distinct from o2) then
      raise exception 'An IMEI that is already on record cannot be changed. Ask a super admin to record a board replacement.'
        using errcode = 'check_violation';
    end if;
  end if;

  r := public.register_identity(new.shop_id, array[new.imei1, new.imei2], new.serial_number, 'staff',
                                case when tg_op = 'UPDATE' then old.platform_device_id else null end, null, null, false);
  if r->>'result' = 'conflict' then
    if r->>'reason' = 'slot_changed' then
      raise exception 'This phone already has two IMEIs on record.' using errcode = 'unique_violation';
    end if;
    raise exception 'This device is already registered on the platform. Contact support.' using errcode = 'unique_violation';
  end if;
  pd := (r->>'platform_device_id')::uuid;
  if tg_op = 'INSERT' and exists (select 1 from devices where shop_id = new.shop_id and platform_device_id = pd) then
    raise exception 'A device with this IMEI already exists.' using errcode = 'unique_violation';
  end if;
  new.platform_device_id := pd;
  return new;
end $$;

-- ───────────────────────────── 6. Super-admin transfer between shops ─────────────────────────────
-- Moves custody of a phone to another shop. Refused while money is owed unless p_override is true;
-- either way it is recorded in the identity history and the audit log.
create or replace function public.transfer_platform_device(
  p_pd uuid, p_to_shop uuid, p_actor uuid, p_reason text, p_override boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare owing numeric; prev uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select coalesce(sum(greatest(coalesce(outstanding_balance, 0), 0)), 0) into owing
    from installment_agreements where platform_device_id = p_pd and status not in ('cancelled', 'released');
  if owing > 0 and not p_override then
    raise exception 'Cannot transfer: % is still owed on this phone.', owing;
  end if;
  select custodian_shop_id into prev from platform_devices where id = p_pd for update;
  update platform_devices set custodian_shop_id = p_to_shop, status = 'active', updated_at = now() where id = p_pd;
  update device_identity_conflicts set status = 'resolved', resolved_by = p_actor, resolved_at = now(), resolution = 'transferred: ' || p_reason
    where existing_platform_device_id = p_pd and claimant_shop_id = p_to_shop and status = 'open';
  insert into device_identity_events (platform_device_id, shop_id, event_type, actor_id, details)
  values (p_pd, p_to_shop, 'transferred', p_actor, jsonb_build_object('from_shop', prev, 'reason', p_reason, 'owing', owing, 'override', p_override));
  insert into audit_logs (shop_id, actor_id, action, entity, entity_id, details)
  values (coalesce(prev, p_to_shop), p_actor, 'transfer_platform_device', 'platform_devices', p_pd,
          jsonb_build_object('to_shop', p_to_shop, 'reason', p_reason, 'owing', owing, 'override', p_override));
  return jsonb_build_object('ok', true, 'owing', owing);
end $$;

-- ───────────────────────────── 7. Backfill existing phones ─────────────────────────────
do $$
declare d record; r jsonb; pd uuid; v text; n int := 0; merged int := 0; clashed int := 0; ord int; slot smallint;
begin
  for d in select id, shop_id, imei1, imei2, serial_number from public.devices
            where platform_device_id is null order by created_at, id loop
    r := public.register_identity(d.shop_id, array[d.imei1, d.imei2], d.serial_number, 'backfill', null, null, d.id, true);
    if r->>'result' = 'conflict' then
      -- keep the phone usable: its own identity, holding only identifiers nobody else owns; the clash is a review case
      insert into public.platform_devices (custodian_shop_id, created_by_shop_id, status, identity_level)
      values (d.shop_id, d.shop_id, 'in_review', 'declared') returning id into pd;
      for v, ord in select public.normalize_imei(x), n from unnest(array[d.imei1, d.imei2]) with ordinality t(x, n) order by n loop
        continue when v is null;
        insert into public.device_identifiers (platform_device_id, kind, slot, value_norm, luhn_ok, state, source)
        values (pd, 'imei', ord::smallint, v, public.imei_luhn_ok(v), 'declared', 'backfill')
        on conflict (value_norm) where kind = 'imei' do nothing;
      end loop;
      clashed := clashed + 1;
    else
      pd := (r->>'platform_device_id')::uuid;
    end if;
    update public.devices set platform_device_id = pd where id = d.id;
    if exists (select 1 from public.devices o where o.shop_id = d.shop_id and o.platform_device_id = pd and o.id <> d.id) then
      insert into public.device_identity_events (platform_device_id, shop_id, event_type, details)
      values (pd, d.shop_id, 'duplicate_inventory_row', jsonb_build_object('device_id', d.id, 'note', 'same phone registered twice in this shop; review and delete the extra row'));
      merged := merged + 1;
    end if;
    n := n + 1;
  end loop;
  raise notice 'identity backfill: % devices linked, % duplicate inventory rows, % cross-shop clashes', n, merged, clashed;
end $$;

-- enrollments and agreements follow their device
update public.device_enrollments e set platform_device_id = d.platform_device_id
  from public.devices d where e.device_id = d.id and e.platform_device_id is null and d.platform_device_id is not null;
update public.installment_agreements a set platform_device_id = d.platform_device_id
  from public.devices d where a.device_id = d.id and a.platform_device_id is null and d.platform_device_id is not null;

-- Agreements that were detached from their phone earlier (reset / delete) still carry the phone's IMEI as text
-- (migration 0016). Re-attach them to the identity so the history is protected too.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'installment_agreements' and column_name = 'device_imei') then
    update public.installment_agreements a set platform_device_id = i.platform_device_id
      from public.device_identifiers i
     where a.platform_device_id is null and a.device_imei is not null
       and i.kind = 'imei' and i.value_norm = public.normalize_imei(a.device_imei);
  end if;
end $$;

-- ───────────────────────────── 8. Close ghost duplicate enrollments ─────────────────────────────
-- A phone must have one active enrollment. Where several exist, keep the enrolled one that checked in most
-- recently and mark the others 'replaced' (token cleared so it can never authenticate). Nothing is deleted.
with ranked as (
  select id, row_number() over (
           partition by device_id
           order by (status = 'enrolled') desc, last_sync desc nulls last, created_at desc) rn
    from public.device_enrollments
   where device_id is not null and status in ('pending', 'enrolled')
), upd as (
  update public.device_enrollments e
     set status = 'replaced', device_token_hash = null, updated_at = now()
    from ranked r
   where e.id = r.id and r.rn > 1
  returning e.id, e.device_id, e.shop_id, e.platform_device_id
)
insert into public.device_identity_events (platform_device_id, shop_id, event_type, details)
select platform_device_id, shop_id, 'enrollment_replaced',
       jsonb_build_object('enrollment_id', id, 'device_id', device_id, 'reason', 'duplicate active enrollment')
  from upd;

-- ───────────────────────────── 9. Turn on the staff guard (after the backfill) ─────────────────────────────
drop trigger if exists trg_devices_identity_sync on public.devices;
create trigger trg_devices_identity_sync
  before insert or update of imei1, imei2, serial_number on public.devices
  for each row execute function public.devices_identity_sync();

-- ───────────────────────────── 10. Access control ─────────────────────────────
alter table public.platform_devices          enable row level security;
alter table public.device_identifiers        enable row level security;
alter table public.device_identity_events    enable row level security;
alter table public.device_identity_conflicts enable row level security;

-- A shop reads only the identities it is custodian of. Conflicts are super-admin only. All writes go through
-- the functions above (service role) — there are no insert/update/delete policies.
drop policy if exists pd_read on public.platform_devices;
create policy pd_read on public.platform_devices for select
  using (public.can_access_shop(custodian_shop_id));
drop policy if exists di_read on public.device_identifiers;
create policy di_read on public.device_identifiers for select
  using (exists (select 1 from public.platform_devices p where p.id = platform_device_id));
drop policy if exists die_read on public.device_identity_events;
create policy die_read on public.device_identity_events for select
  using (exists (select 1 from public.platform_devices p where p.id = platform_device_id));
drop policy if exists dic_read on public.device_identity_conflicts;
create policy dic_read on public.device_identity_conflicts for select
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'super_admin'));

revoke all on function public.register_identity(uuid, text[], text, text, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_device(uuid, text[], text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.transfer_platform_device(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.register_identity(uuid, text[], text, text, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.claim_device(uuid, text[], text, text, text, uuid) to service_role;
grant execute on function public.transfer_platform_device(uuid, uuid, uuid, text, boolean) to service_role;

-- ───────────────────────────── 11. Summary (the one result you will see) ─────────────────────────────
select 'platform identities' as what, count(*)::text as n from public.platform_devices
union all select 'identifiers (imei)', count(*)::text from public.device_identifiers where kind = 'imei'
union all select 'non-standard IMEIs (flagged)', count(*)::text from public.device_identifiers where kind = 'imei' and luhn_ok = false
union all select 'devices not linked', count(*)::text from public.devices where platform_device_id is null
union all select 'duplicate inventory rows to clean up', count(*)::text from public.device_identity_events where event_type = 'duplicate_inventory_row'
union all select 'open cross-shop conflicts', count(*)::text from public.device_identity_conflicts where status = 'open'
union all select 'ghost enrollments replaced', count(*)::text from public.device_enrollments where status = 'replaced';

commit;
