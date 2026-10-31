import { BarChart3, Wallet, HandCoins, TrendingUp, UserSquare, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, Toolbar } from "@/components/super-admin/parts";
import { loadShops } from "@/lib/admin/platform";
import { getDashboardTotals } from "@/lib/billing/dashboard-totals";
import { formatCurrency } from "@/lib/shared/utils";

export const dynamic = "force-dynamic";

// Platform-wide numbers, then one line per shop so the owner of the platform can compare shops.
export default async function ReportsPage() {
  const supabase = createClient();
  const { list } = await loadShops();
  const count = (table: string, status?: string) => {
    const q = supabase.from(table).select("*", { count: "exact", head: true });
    return status ? q.eq("status", status) : q;
  };
  const [totals, customers, active, completed, defaulted, perShop] = await Promise.all([
    getDashboardTotals(supabase),
    count("customers"),
    count("installment_agreements", "active"),
    count("installment_agreements", "completed"),
    count("installment_agreements", "defaulted"),
    Promise.all(list.map(async (s) => {
      const [c, a, d, out] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("shop_id", s.id),
        supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("shop_id", s.id).eq("status", "active"),
        supabase.from("devices").select("*", { count: "exact", head: true }).eq("shop_id", s.id),
        supabase.from("installment_agreements").select("outstanding_balance").eq("shop_id", s.id).eq("status", "active"),
      ]);
      const outstanding = ((out.data ?? []) as { outstanding_balance: number | null }[]).reduce((t, r) => t + Number(r.outstanding_balance || 0), 0);
      return { shop: s, customers: c.count ?? 0, active: a.count ?? 0, phones: d.count ?? 0, outstanding };
    })),
  ]);
  const rate = totals.collected + totals.outstanding > 0 ? Math.round((totals.collected / (totals.collected + totals.outstanding)) * 100) : 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Financed" value={formatCurrency(totals.financed)} icon={Wallet} hint="all agreements, all shops" />
        <StatCard label="Collected" value={formatCurrency(totals.collected)} icon={HandCoins} tone="success" hint={`${rate}% of collected + outstanding`} />
        <StatCard label="Outstanding" value={formatCurrency(totals.outstanding)} icon={TrendingUp} tone="warning" />
        <StatCard label="Customers" value={String(customers.count ?? 0)} icon={UserSquare} />
        <StatCard label="Active agreements" value={String(active.count ?? 0)} icon={FileText} tone="success" hint={`${completed.count ?? 0} completed`} />
        <StatCard label="Defaulted" value={String(defaulted.count ?? 0)} icon={BarChart3} tone="danger" />
      </div>
      <Toolbar title="By shop" />
      <DataTable icon={BarChart3} emptyTitle="No shops yet"
        cols={[{ label: "Shop" }, { label: "Customers", align: "right" }, { label: "Phones", align: "right" }, { label: "Active agreements", align: "right" }, { label: "Outstanding", align: "right" }]}
        rows={perShop.map((r) => [
          <span key="n" className="font-medium">{r.shop.name}</span>, String(r.customers), String(r.phones), String(r.active), formatCurrency(r.outstanding),
        ])} />
    </>
  );
}
