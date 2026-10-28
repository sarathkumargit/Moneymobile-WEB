-- Monthly schedule tracking + automatic lock when an installment is overdue.
-- Safe to re-run. Until applied, the schedule still shows; auto-lock stays off.
alter table installment_schedules add column if not exists paid_at timestamptz;
alter table installment_schedules add column if not exists auto_locked_at timestamptz;
alter table installment_agreements add column if not exists auto_lock boolean not null default true;
-- Why the phone is locked: 'overdue' (auto — unlocks itself when paid), 'manual', 'sim'.
alter table installment_agreements add column if not exists lock_reason text;
create index if not exists idx_schedules_agreement_due on installment_schedules(agreement_id, due_date);
