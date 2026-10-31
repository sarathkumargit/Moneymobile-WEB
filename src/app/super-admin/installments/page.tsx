import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam } from "@/lib/admin/platform";
import { formatCurrency } from "@/lib/shared/utils";

export const dynamic = "force-dynamic";
type Row = {
  id: string; agreement_code: string | null; total_repayment: number | null; outstanding_balance: number | null;
  installment_amount: number | null; installment_months: number | null; status: string; restriction: string | null;
  shop_id: string | null; customers: { full_name: string | null } | null;
};
const sBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { active: "success", completed: "neutral", defaulted: "danger", cancelled: "neutral" };

export default async function InstallmentsPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let q = supabase.from("installment_agreements")
    .select("id,agreement_code,total_repayment,outstanding_balance,installment_amount,installment_months,status,restriction,shop_id, customers(full_name)")
    .order("created_at", { ascending: false }).limit(LIMIT);
  if (shop) q = q.eq("shop_id", shop);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <Toolbar title="Installment agreements" hint={`${rows.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/installments" /></Toolbar>
      <DataTable icon={FileText} emptyTitle="No agreements yet"
        cols={[{ label: "Agreement" }, { label: "Customer" }, { label: "Shop" }, { label: "Plan" }, { label: "Total repayment", align: "right" }, { label: "Outstanding", align: "right" }, { label: "Status" }]}
        rows={rows.map((r) => [
          <span key="c" className="font-mono text-xs">{r.agreement_code ?? "—"}</span>,
          <span key="n" className="font-medium">{r.customers?.full_name ?? "—"}</span>,
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          muted(r.installment_months ? `${formatCurrency(Number(r.installment_amount || 0))} × ${r.installment_months}` : null),
          formatCurrency(Number(r.total_repayment || 0)),
          formatCurrency(Number(r.outstanding_balance || 0)),
          <div key="s" className="flex flex-wrap gap-1">
            <Badge variant={sBadge[r.status] ?? "neutral"} className="capitalize">{r.status}</Badge>
            {r.restriction === "restricted" && <Badge variant="danger">Locked</Badge>}
          </div>,
        ])} />
    </>
  );
}
