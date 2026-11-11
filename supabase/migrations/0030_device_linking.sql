-- 0030 — Phone linking + safe Reset for resale / Delete phone
--
-- 1. link_enrollment_to_device()   Connects a registered phone (enrollment) to its phone record (devices row),
--    used by the automatic IMEI match (setup + every check-in) and by Device Mgmt -> "Needs linking" -> Link.
--    Unused old registrations of that phone (an enrollment token that was never used, a stale earlier install)
--    are retired in the same step, so the customer page always shows the real, connected phone.
--
-- 2. reset_device_for_resale() and delete_device_record()   The whole change happens in ONE transaction: either
--    everything is done or nothing is. Before, these were many separate writes from the website, and a failure
--    half-way left a phone half-reset (still linked in some tables, unlinked in others). Both refuse a phone that
--    still has money owed unless the shop owner explicitly confirms (p_force).
--
-- Only the website's server (service role) can call these. Safe to run more than once.

begin;

-- ───────────────────────────── 1. Link a registered phone to its phone record ─────────────────────────────
create or replace function public.link_enrollment_to_device(
  p_enrollment uuid, p_device uuid, p_actor uuid default null, p_source text default 'manual', p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  e record; d record; other record;
  v_agr uuid; v_cust uuid; retired uuid[] := '{}';
begin
  select * into e from device_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'This registration no longer exists.'); end if;
  select * into d from devices where id = p_device for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Phone record not found.'); end if;
  if e.shop_id is distinct from d.shop_id then
    return jsonb_build_object('ok', false, 'code', 'other_shop', 'error', 'That phone record belongs to another shop.');
  end if;
  if e.status <> 'enrolled' or e.device_token_hash is null then
    return jsonb_build_object('ok', false, 'code', 'not_enrolled', 'error', 'Only a phone that is set up and checking in can be linked.');
  end if;
  if e.device_id = p_device then
    return jsonb_build_object('ok', true, 'already', true, 'enrollment_id', e.id, 'device_id', d.id, 'agreement_id', e.agreement_id);
  end if;
  if e.device_id is not null and not p_force then
    return jsonb_build_object('ok', false, 'code', 'linked_elsewhere', 'error', 'This phone is already linked to another phone record.');
  end if;

  -- Another phone that is still checking in on this record? Never take it over silently.
  for other in
    select id, status, last_sync, device_token_hash from device_enrollments
     where device_id = p_device and id <> p_enrollment and status = 'enrolled'
       and device_token_hash is not null and last_sync > now() - interval '3 days'
  loop
    if not p_force then
      return jsonb_build_object('ok', false, 'code', 'other_active', 'last_sync', other.last_sync,
        'error', 'Another phone on this record checked in recently. If this phone was reset or replaced, the shop owner can link it anyway.');
    end if;
  end loop;

  -- Retire every other registration of this phone record (unused tokens, an earlier install). They are
  -- detached from the record so pages show only the connected phone; nothing is deleted.
  with r as (
    update device_enrollments
       set status = 'replaced', device_token_hash = null, device_id = null, updated_at = now()
     where device_id = p_device and id <> p_enrollment and status in ('pending', 'enrolled', 'replaced')
    returning id
  ) select coalesce(array_agg(id), '{}') into retired from r;
  update device_commands set status = 'superseded', result = 'registration replaced; phone linked to its record'
   where enrollment_id = any(retired) and status = 'pending';

  v_cust := d.customer_id;
  select id into v_agr from installment_agreements
   where device_id = p_device and status not in ('cancelled', 'released')
   order by created_at desc limit 1;

  update device_enrollments
     set device_id = p_device,
         customer_id = coalesce(v_cust, customer_id),
         agreement_id = coalesce(v_agr, agreement_id),
         imei1 = coalesce(imei1, d.imei1),
         updated_at = now()
   where id = p_enrollment;
  update devices set enrollment = 'enrolled' where id = p_device;

  -- Registry link + history (migration 0023). Best effort: skipped quietly if 0023 is not installed.
  begin
    execute 'update device_enrollments set platform_device_id = coalesce($1, platform_device_id) where id = $2'
      using d.platform_device_id, p_enrollment;
    if d.platform_device_id is not null then
      execute 'insert into device_identity_events (platform_device_id, shop_id, event_type, actor_id, details) '
           || 'select $1, $2, ''enrollment_replaced'', $3, jsonb_build_object(''enrollment_id'', x, ''device_id'', $4, ''reason'', ''phone linked to its record'') from unnest($5::uuid[]) x'
        using d.platform_device_id, d.shop_id, p_actor, p_device, retired;
      execute 'insert into device_identity_events (platform_device_id, shop_id, event_type, actor_id, details) values ($1, $2, ''enrollment_linked'', $3, $4)'
        using d.platform_device_id, d.shop_id, p_actor, jsonb_build_object('enrollment_id', p_enrollment, 'device_id', p_device, 'source', p_source);
    end if;
  exception when undefined_table or undefined_column then null;
  end;

  insert into audit_logs (shop_id, actor_id, action, entity, entity_id, details)
  values (d.shop_id, p_actor, 'enrollment_linked', 'device_enrollments', p_enrollment,
          jsonb_build_object('device_id', p_device, 'agreement_id', v_agr, 'customer_id', v_cust, 'source', p_source,
                             'forced', p_force, 'retired', to_jsonb(retired)));

  return jsonb_build_object('ok', true, 'enrollment_id', p_enrollment, 'device_id', p_device,
                            'agreement_id', v_agr, 'customer_id', v_cust, 'retired', coalesce(array_length(retired, 1), 0));
end $$;

-- ───────────────────────────── 2. Money still owed on a phone ─────────────────────────────
create or replace function public.device_owed(p_device uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(greatest(coalesce(outstanding_balance, 0), 0)), 0)
    from installment_agreements where device_id = p_device and status not in ('cancelled', 'released')
$$;

-- ───────────────────────────── 3. Reset for resale (all or nothing) ─────────────────────────────
create or replace function public.reset_device_for_resale(
  p_device uuid, p_shop uuid, p_actor uuid default null, p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d record; owed numeric; ids uuid[];
begin
  select * into d from devices where id = p_device for update;
  if not found or d.shop_id is distinct from p_shop then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Phone not found.');
  end if;
  owed := public.device_owed(p_device);
  if owed > 0 and not p_force then
    return jsonb_build_object('ok', false, 'code', 'owed', 'owed', owed,
      'error', format('Rs %s is still owed on this phone. Only the shop owner can reset it, from the customer''s page.', to_char(owed, 'FM999,999,999')));
  end if;

  select coalesce(array_agg(id), '{}') into ids from device_enrollments where device_id = p_device;
  delete from device_commands where enrollment_id = any(ids);
  delete from device_security_events where enrollment_id = any(ids);
  delete from device_locations where enrollment_id = any(ids);
  update device_enrollments
     set status = 'released', device_token_hash = null, management_active = false, agreement_id = null, customer_id = null,
         last_lat = null, last_lng = null, location_accuracy = null, location_at = null, updated_at = now()
   where id = any(ids);
  -- The old agreements stay on the customer for their payment history (with their balance, if any).
  update installment_agreements set device_id = null where device_id = p_device;
  update devices set status = 'in_stock', customer_id = null, enrollment = 'not_enrolled' where id = p_device;

  insert into audit_logs (shop_id, actor_id, action, entity, entity_id, details)
  values (d.shop_id, p_actor, 'reset_device_for_resale', 'devices', p_device,
          jsonb_build_object('imei', d.imei1, 'previous_customer', d.customer_id, 'owed', owed, 'forced', p_force and owed > 0,
                             'enrollments', coalesce(array_length(ids, 1), 0)));
  return jsonb_build_object('ok', true, 'owed', owed, 'previous_customer', d.customer_id);
end $$;

-- ───────────────────────────── 4. Delete phone (all or nothing) ─────────────────────────────
create or replace function public.delete_device_record(
  p_device uuid, p_shop uuid, p_actor uuid default null, p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d record; owed numeric;
begin
  select * into d from devices where id = p_device for update;
  if not found or d.shop_id is distinct from p_shop then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Phone not found.');
  end if;
  owed := public.device_owed(p_device);
  if owed > 0 and not p_force then
    return jsonb_build_object('ok', false, 'code', 'owed', 'owed', owed,
      'error', format('Rs %s is still owed on this phone. Only the shop owner can delete it, from the customer''s page.', to_char(owed, 'FM999,999,999')));
  end if;

  -- Registrations cascade to their commands / alerts / locations / unlock requests.
  delete from device_enrollments where device_id = p_device;
  update installment_agreements set device_id = null where device_id = p_device;
  delete from devices where id = p_device;

  insert into audit_logs (shop_id, actor_id, action, entity, entity_id, details)
  values (d.shop_id, p_actor, 'delete_device', 'devices', p_device,
          jsonb_build_object('imei', d.imei1, 'brand', d.brand, 'model', d.model, 'previous_customer', d.customer_id,
                             'owed', owed, 'forced', p_force and owed > 0));
  return jsonb_build_object('ok', true, 'owed', owed, 'previous_customer', d.customer_id);
end $$;

revoke all on function public.link_enrollment_to_device(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.device_owed(uuid) from public, anon, authenticated;
revoke all on function public.reset_device_for_resale(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_device_record(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.link_enrollment_to_device(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.device_owed(uuid) to service_role;
grant execute on function public.reset_device_for_resale(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.delete_device_record(uuid, uuid, uuid, boolean) to service_role;

commit;

select 'ok' as migration_0030;
