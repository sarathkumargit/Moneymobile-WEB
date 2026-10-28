import Link from "next/link";
import { Store, FileText, Wallet, AlertTriangle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuperAdminOverview() {
  const supabase = createClient();
  const [shopsAll, shopsSuspended, agreementsActive, outstandingRows, overdue, shopsList, recent] =
    await Promise.all([
      supabase.from("shops").select("*", { count: "exact", head: true }),
      supabase.from("shops").select("*", { count: "exact", head: true }).eq("status", "suspended"),
      supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("installment_agreements").select("outstanding_balance"),
      supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("status", "defaulted"),
      supabase.from("shops").select("id,name,status").order("created_at", { ascending: false }).limit(6),
      supabase
        .from("installment_agreements")
        .select("id, outstanding_balance, installment_amount, status, customers(full_name,phone), devices(imei1)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const shopsTotal = shopsAll.count ?? 0;
  const suspended = shopsSuspended.count ?? 0;
  const outstanding = (outstandingRows.data ?? []).reduce(
    (s: number, r: { outstanding_balance: number | null }) => s + Number(r.outstanding_balance || 0),
    0
  );
  const shops = shopsList.data ?? [];
  const recentRows = (recent.data ?? []) as unknown as Array<{
    id: string; outstanding_balance: number | null; installment_amount: number | null;
    status: string; customers: { full_name: string | null; phone: string | null } | null;
    devices: { imei1: string | null } | null;
  }>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered Shops" value={String(shopsTotal)} icon={Store} hint={`${shopsTotal - suspended} active · ${suspended} suspended`} />
        <StatCard label="Active Agreements" value={String(agreementsActive.count ?? 0)} icon={FileText} tone="success" />
        <StatCard label="Total Outstanding" value={formatCurrency(outstanding)} icon={Wallet} hint="across all shops" />
        <StatCard label="Overdue / Defaulted" value={String(overdue.count ?? 0)} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent installment accounts</CardTitle></CardHeader>
          <CardContent>
            {recentRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No installment accounts yet.</p>
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

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Shops</CardTitle>
            <Link href="/super-admin/shops"><Button variant="outline" size="sm">Manage</Button></Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {shops.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No shops yet.</p>
                <Link href="/super-admin/shops">
                  <Button size="sm" className="mt-3"><Plus className="h-4 w-4" /> Create first shop</Button>
                </Link>
              </div>
            ) : (
              shops.map((s: { id: string; name: string; status: string }) => (
                <div key={s.id} className="flex items-center justify-between">
                  <p className="text-sm font-medium">{s.name}</p>
                  <Badge variant={s.status === "active" ? "success" : "danger"} className="capitalize">{s.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
