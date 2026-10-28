-- Keep the phone's model + IMEI ON the agreement and on every payment, so the record still says
-- which phone it was even after that phone is reset for resale or deleted.
alter table installment_agreements add column if not exists device_model text;
alter table installment_agreements add column if not exists device_imei  text;
alter table payment_transactions   add column if not exists device_model text;
alter table payment_transactions   add column if not exists device_imei  text;

-- Fill in existing records from the phone they are linked to today.
update installment_agreements a
   set device_model = nullif(trim(coalesce(d.brand, '') || ' ' || coalesce(d.model, '')), ''),
       device_imei  = d.imei1
  from devices d
 where a.device_id = d.id and a.device_imei is null;

update payment_transactions p
   set device_model = a.device_model,
       device_imei  = a.device_imei
  from installment_agreements a
 where p.agreement_id = a.id and p.device_imei is null;

create index if not exists idx_payments_device_imei   on payment_transactions(device_imei);
create index if not exists idx_agreements_device_imei on installment_agreements(device_imei);
