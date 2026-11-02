-- 0018 — 30-minute unlock-code window
--
-- When a customer types a shop unlock code, the phone stays fully unlocked until this time.
-- While it is in the future, the automatic overdue lock is not put back (lib/billing/overdue-lock.ts);
-- after it, the next check-in locks the phone again if the installment is still unpaid.
-- Set by api/devices/security-event when the phone reports OFFLINE_UNLOCK_CODE.
--
-- Run once in Supabase → SQL Editor. Safe to run more than once.

alter table public.installment_agreements
  add column if not exists unlock_grace_until timestamptz;
