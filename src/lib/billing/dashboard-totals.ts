import type { createClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createClient>;
export type Totals = { financed: number; outstanding: number; collected: number };

// Sums computed by the dashboard_totals() Postgres function (migration 0012) — one tiny row
// instead of every agreement and payment. If the migration has not been run yet the RPC errors,
// and we fall back to the original approach so the page never breaks.
export async function getDashboardTotals(supabase: Client): Promise<Totals> {
  const { data, error } = await supabase.rpc("dashboard_totals");
  const row = Array.isArray(data) ? data[0] : data;
  if (!error && row) {
    return { financed: Number(row.financed || 0), outstanding: Number(row.outstanding || 0), collected: Number(row.collected || 0) };
  }
  if (error) console.warn("[dashboard] dashboard_totals() unavailable, summing rows instead (run migration 0012_dashboard_totals.sql):", error.message);
  const [agr, pays] = await Promise.all([
    supabase.from("installment_agreements").select("financed_amount,outstanding_balance"),
    supabase.from("payment_transactions").select("amount"),
  ]);
  const a = (agr.data ?? []) as { financed_amount: number | null; outstanding_balance: number | null }[];
  const p = (pays.data ?? []) as { amount: number | null }[];
  return {
    financed: a.reduce((s, r) => s + Number(r.financed_amount || 0), 0),
    outstanding: a.reduce((s, r) => s + Number(r.outstanding_balance || 0), 0),
    collected: p.reduce((s, r) => s + Number(r.amount || 0), 0),
  };
}
