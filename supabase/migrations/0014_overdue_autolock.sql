-- Automatic lock when an installment due date passes without payment, and a reason tag so a
-- payment that clears the arrears can auto-unlock ONLY an overdue lock (never a SIM/manual one).
-- Safe to re-run.
alter table installment_agreements add column if not exists restriction_reason text; -- 'overdue' | 'sim' | 'manual' | null

-- Fast "is anything overdue for this agreement" lookups.
create index if not exists idx_schedules_agreement_due on installment_schedules(agreement_id, due_date);
create index if not exists idx_schedules_agreement_status on installment_schedules(agreement_id, status);
