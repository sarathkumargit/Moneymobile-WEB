-- 0024 — Agreement protection + one active enrollment per phone  (DRAFT FOR REVIEW — do not run yet)
--
-- Run this AFTER 0023 AND after the matching web update is deployed (the web checks the balance first and shows a
-- friendly message; this is the database backstop, so nothing can detach a phone from money owed even if a
-- screen or API is missed).
--
--   1. A phone can have only ONE active (pending/enrolled) enrollment. This is what stops the 0.3-second double
--      registration seen on 4 Nov.
--   2. An agreement that is still live and has a balance cannot be unlinked from its phone, and that phone
--      cannot be deleted. "Live" = status not cancelled/released, the same rule the Release screen already uses.
--   3. Only override_unlink_device() (service role, i.e. the super-admin path) can bypass this, and it requires a
--      reason and writes the audit log and the identity history.
--
-- Safe to run more than once. One transaction: all or nothing.

begin;

-- 1 ── one active enrollment per phone
create unique index if not exists device_enrollments_one_active
  on public.device_enrollments (device_id)
  where device_id is not null and status in ('pending', 'enrolled');

-- 2 ── guards
create or replace function public.agreement_unlink_guard() returns trigger
language plpgsql as $$
begin
  if old.device_id is not null and new.device_id is null
     and old.status not in ('cancelled', 'released')
     and coalesce(old.outstanding_balance, 0) > 0
     and coalesce(current_setting('mm.override_unlink', true), '') <> 'on' then
    raise exception 'This phone still has Rs % owed. Cancel or settle the agreement first.', old.outstanding_balance
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_agreement_unlink_guard on public.installment_agreements;
create trigger trg_agreement_unlink_guard
  before update of device_id on public.installment_agreements
  for each row execute function public.agreement_unlink_guard();

create or replace function public.device_delete_guard() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.installment_agreements a
              where a.device_id = old.id and a.status not in ('cancelled', 'released')
                and coalesce(a.outstanding_balance, 0) > 0)
     and coalesce(current_setting('mm.override_unlink', true), '') <> 'on' then
    raise exception 'This phone still has money owed. Cancel or settle the agreement before deleting it.'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_device_delete_guard on public.devices;
create trigger trg_device_delete_guard
  before delete on public.devices
  for each row execute function public.device_delete_guard();

-- 3 ── audited override (super admin only; called from server code with the service role)
create or replace function public.override_unlink_device(p_device_id uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d record; owing numeric; n int;
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select id, shop_id, platform_device_id into d from devices where id = p_device_id;
  if not found then raise exception 'Unknown device.'; end if;
  select coalesce(sum(greatest(coalesce(outstanding_balance, 0), 0)), 0) into owing
    from installment_agreements where device_id = p_device_id and status not in ('cancelled', 'released');
  perform set_config('mm.override_unlink', 'on', true);          -- this transaction only
  update installment_agreements set device_id = null where device_id = p_device_id;
  get diagnostics n = row_count;
  insert into audit_logs (shop_id, actor_id, action, entity, entity_id, details)
  values (d.shop_id, p_actor, 'override_unlink_device', 'devices', p_device_id,
          jsonb_build_object('reason', p_reason, 'owing', owing, 'agreements_unlinked', n));
  insert into device_identity_events (platform_device_id, shop_id, event_type, actor_id, details)
  values (d.platform_device_id, d.shop_id, 'override_unlink', p_actor,
          jsonb_build_object('reason', p_reason, 'owing', owing, 'agreements_unlinked', n));
  return jsonb_build_object('ok', true, 'owing', owing, 'agreements_unlinked', n);
end $$;

revoke all on function public.override_unlink_device(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.override_unlink_device(uuid, uuid, text) to service_role;

commit;
