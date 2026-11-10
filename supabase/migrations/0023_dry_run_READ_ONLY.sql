-- READ-ONLY preview of what migration 0023 would do. Changes nothing.
-- Paste into Supabase -> SQL Editor and run once; you get one table.

with d as (
  select id, shop_id, coalesce(brand,'') || ' ' || coalesce(model,'') as phone,
         regexp_replace(coalesce(imei1,''), '\D', '', 'g') as n1,
         regexp_replace(coalesce(imei2,''), '\D', '', 'g') as n2
  from public.devices
), ids as (
  select id, shop_id, phone, n1 as n from d where n1 <> ''
  union all
  select id, shop_id, phone, n2 from d where n2 <> ''
), grp as (
  select n, count(distinct shop_id) as shops, array_agg(distinct id::text) as device_ids, min(phone) as phone
    from ids group by n having count(distinct id) > 1
), ghost as (
  select id, device_id, status, last_sync, created_at,
         row_number() over (partition by device_id
                            order by (status = 'enrolled') desc, last_sync desc nulls last, created_at desc) as rn
    from public.device_enrollments
   where device_id is not null and status in ('pending', 'enrolled')
)
select 'IMEI on several device rows -> ' ||
         case when shops > 1 then 'CROSS-SHOP CONFLICT: not merged, goes to review'
              else 'same shop: linked to ONE identity, extra row listed for you to delete' end as plan,
       phone as detail, n as imei, device_ids::text as ids
  from grp
union all
select 'ghost enrollment -> marked replaced, token cleared', 'keeps the most recent check-in', null, id::text
  from ghost where rn > 1
union all
select 'enrollment with no device -> stays unlinked', coalesce(model, ''), imei1, id::text
  from public.device_enrollments where device_id is null
union all
select 'devices that will get an identity', count(*)::text, null, null from public.devices
order by 1;
