-- Give each installment an exact due moment (date + time), so the phone can lock the instant a
-- due date-and-time passes, not just by calendar day. Existing rows keep their date at midnight.
-- Safe to re-run.
alter table installment_schedules add column if not exists due_at timestamptz;
update installment_schedules set due_at = (due_date::timestamp) where due_at is null;
create index if not exists idx_schedules_agreement_due_at on installment_schedules(agreement_id, due_at);
