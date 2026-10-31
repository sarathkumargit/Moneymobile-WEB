-- 0018: per-shop license limit (max number of agreements = phones a shop may sell).
-- NULL = unlimited (existing shops keep working). Run once in Supabase SQL editor.
alter table public.shops add column if not exists license_limit integer
  check (license_limit is null or license_limit >= 0);

-- Safety net: even if the app check is bypassed, the database refuses agreement
-- number (limit + 1) for a shop.
create or replace function public.enforce_license_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim integer; used integer;
begin
  select license_limit into lim from public.shops where id = new.shop_id;
  if lim is null then return new; end if;
  select count(*) into used from public.installment_agreements where shop_id = new.shop_id;
  if used >= lim then
    raise exception 'LICENSE_LIMIT: this shop has used all % licenses. Contact the super admin.', lim;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_license_limit on public.installment_agreements;
create trigger trg_enforce_license_limit before insert on public.installment_agreements
  for each row execute function public.enforce_license_limit();
