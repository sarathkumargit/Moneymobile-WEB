-- Interest / loan fields on installment agreements (immutable snapshot of terms)
alter table installment_agreements
  add column if not exists interest_rate numeric(6,2) default 0,
  add column if not exists interest_type text default 'flat',
  add column if not exists installment_months int default 0,
  add column if not exists total_interest numeric(12,2) default 0,
  add column if not exists total_repayment numeric(12,2) default 0,
  add column if not exists additional_charges numeric(12,2) default 0;
