import { Users, HardDrive, FileText, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/shared/utils";
import { getDashboardTotals } from "@/lib/billing/dashboard-totals";

export const dynamic = "force-dynamic";

export default async function ShopOverview() {
  const supabase = createClient();
  const [customers, devices, agreementsActive, totals, recent] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("devices").select("*", { count: "exact", head: true }),
    supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("status", "active"),
    getDashboardTotals(supabase),
    supabase
      .from("installment_agreements")
      .select("id, outstanding_balance, status, customers(full_name,phone), devices(imei1)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const outstanding = totals.outstanding;
  const recentRows = (recent.data ?? []) as unknown as Array<{
    id: string; outstanding_balance: number | null; status: string;
    customers: { full_name: string | null; phone: string | null } | null;
    devices: { imei1: string | null } | null;
  }>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={String(customers.count ?? 0)} icon={Users} />
        <StatCard label="Devices" value={String(devices.count ?? 0)} icon={HardDrive} tone="success" />
        <StatCard label="Active Agreements" value={String(agreementsActive.count ?? 0)} icon={FileText} />
        <StatCard label="Outstanding" value={formatCurrency(outstanding)} icon={Wallet} tone="danger" />
      </div>

      <Card>
        <CardHeader><CardTitle>Recent installment accounts</CardTitle></CardHeader>
        <CardContent>
          {recentRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No installment accounts yet. Add customers and agreements to see them here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Customer</th>
                    <th className="pb-2 pr-4 font-medium">IMEI</th>
                    <th className="pb-2 pr-4 font-medium text-right">Balance</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{r.customers?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.customers?.phone ?? ""}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.devices?.imei1 ?? "—"}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrency(Number(r.outstanding_balance || 0))}</td>
                      <td className="py-3"><Badge variant="neutral" className="capitalize">{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
