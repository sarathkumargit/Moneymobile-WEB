import { Users, HardDrive, FileText, Wallet, TrendingUp, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { getDashboardTotals } from "@/lib/dashboard-totals";
export const dynamic = "force-dynamic";
export default async function ReportsPage() {
  const supabase = createClient();
  const [customers, devices, active, completed, totals, topOutstanding] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("devices").select("*", { count: "exact", head: true }),
    supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("status", "completed"),
    getDashboardTotals(supabase),
    supabase.from("installment_agreements").select("id,agreement_code,outstanding_balance, customers(full_name)").eq("status", "active").order("outstanding_balance", { ascending: false }).limit(8),
  ]);
  const { financed, outstanding, collected } = totals;
  const top = (topOutstanding.data ?? []) as unknown as { id: string; agreement_code: string | null; outstanding_balance: number; customers: { full_name: string } | null }[];
  return (<>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Customers" value={String(customers.count ?? 0)} icon={Users} />
      <StatCard label="Devices" value={String(devices.count ?? 0)} icon={HardDrive} />
      <StatCard label="Active agreements" value={String(active.count ?? 0)} icon={FileText} />
      <StatCard label="Completed agreements" value={String(completed.count ?? 0)} icon={CheckCircle2} tone="success" />
      <StatCard label="Total financed" value={formatCurrency(financed)} icon={TrendingUp} />
      <StatCard label="Total collected" value={formatCurrency(collected)} icon={Wallet} tone="success" />
    </div>
    <Card><CardHeader><CardTitle>Highest outstanding balances</CardTitle></CardHeader><CardContent className="p-0">
      {top.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No active agreements.</p> : (
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Code</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium text-right">Outstanding</th></tr></thead><tbody>
        {top.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-mono text-xs">{r.agreement_code ?? "—"}</td><td className="p-4 font-medium">{r.customers?.full_name ?? "—"}</td><td className="p-4 text-right font-semibold">{formatCurrency(Number(r.outstanding_balance))}</td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground">Total outstanding across active agreements: <strong>{formatCurrency(outstanding)}</strong></p>
  </>);
}
