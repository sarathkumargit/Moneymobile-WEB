-- Guarantor: extra fields + link to the customer/agreement it backs.
alter table guarantors
  add column if not exists email text,
  add column if not exists nic_doc_url text,
  add column if not exists customer_id uuid references customers(id) on delete set null,
  add column if not exists agreement_id uuid references installment_agreements(id) on delete set null;
create index if not exists idx_guarantors_customer on guarantors(customer_id);
create index if not exists idx_guarantors_agreement on guarantors(agreement_id);

-- Private bucket for ID-card photos (customers + guarantors). Accessed only server-side
-- via the service role; viewed through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('customer-docs', 'customer-docs', false)
on conflict (id) do nothing;
