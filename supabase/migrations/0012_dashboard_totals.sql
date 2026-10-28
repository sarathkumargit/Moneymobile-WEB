-- Dashboard money totals computed in Postgres instead of downloading every row to sum in Node.
-- SECURITY INVOKER (the default) means Row Level Security still applies, so each caller only
-- sums the agreements/payments they could already read — results are identical to before.
-- Safe to re-run. The web app falls back to the old row-by-row sum until this is applied.
create or replace function public.dashboard_totals()
returns table (financed numeric, outstanding numeric, collected numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select coalesce(sum(financed_amount), 0) from installment_agreements),
    (select coalesce(sum(outstanding_balance), 0) from installment_agreements),
    (select coalesce(sum(amount), 0) from payment_transactions);
$$;

grant execute on function public.dashboard_totals() to authenticated;

-- Lists sorted by date on the payments and agreements pages
create index if not exists idx_payments_paid_at on payment_transactions(paid_at desc);
create index if not exists idx_agreements_status_created on installment_agreements(status, created_at desc);
