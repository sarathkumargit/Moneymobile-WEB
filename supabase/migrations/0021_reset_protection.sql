-- 0021 — Per-shop reset protection (Factory Reset Protection, Android 11+)
--
-- shops.frp_account_ids        the shop's own Google account ID(s), comma-separated numbers. After ANY factory
--                              reset (including the Power + Volume recovery menu) the phone asks for one of these.
-- device_enrollments.frp_*     what the phone itself reports (app 1.10.1+): on | off | unsupported | failed,
--                              the account IDs it actually holds, and when it last reported.
--
-- Run once in Supabase -> SQL Editor. Safe to run more than once. Until it is run, phones keep the old
-- behaviour (the optional platform-wide FRP_ACCOUNT_IDS setting only) and the new screens stay hidden.

alter table public.shops add column if not exists frp_account_ids text;

alter table public.device_enrollments
  add column if not exists frp_state text,
  add column if not exists frp_accounts text,
  add column if not exists frp_checked_at timestamptz;
