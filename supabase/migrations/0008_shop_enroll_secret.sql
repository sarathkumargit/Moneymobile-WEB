-- Per-shop enrollment secret. Baked into the shop's setup file so a plugged-in phone can
-- register itself to the shop by IMEI, with no per-device token typed in.
alter table shops add column if not exists enroll_secret text;
update shops set enroll_secret = replace(gen_random_uuid()::text, '-', '') where enroll_secret is null;
