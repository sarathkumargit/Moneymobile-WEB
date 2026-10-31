import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam } from "@/lib/admin/platform";
import { formatCurrency } from "@/lib/shared/utils";
import { formatSL } from "@/lib/shared/srilanka-time";

export const dynamic = "force-dynamic";
type Row = {
  id: string; amount: number; method: string; reference: string | null; paid_at: string; verification: string;
  shop_id: string | null; device_model?: string | null; device_imei?: string | null; customers: { full_name: string | null } | null;
};
const vBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { verified: "success", pending: "warning", rejected: "danger" };

export default async function PaymentsPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  const run = (cols: string) => {
    let q = supabase.from("payment_transactions").select(`${cols}, customers(full_name)`).order("paid_at", { ascending: false }).limit(LIMIT);
    if (shop) q = q.eq("shop_id", shop);
    return q;
  };
  const base = "id,amount,method,reference,paid_at,verification,shop_id";
  let res = await run(`${base},device_model,device_imei`);
  if (res.error) res = await run(base); // phone columns come from migration 0016
  const rows = (res.data ?? []) as unknown as Row[];
  return (
    <>
      <Toolbar title="Payments" hint={`Newest ${rows.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/payments" /></Toolbar>
      <DataTable icon={CreditCard} emptyTitle="No payments yet"
        cols={[{ label: "Paid" }, { label: "Customer" }, { label: "Shop" }, { label: "Phone" }, { label: "Method" }, { label: "Amount", align: "right" }, { label: "Status" }]}
        rows={rows.map((r) => [
          muted(formatSL(r.paid_at)),
          <span key="n" className="font-medium">{r.customers?.full_name ?? "—"}</span>,
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          muted([r.device_model, r.device_imei].filter(Boolean).join(" · ") || null),
          <span key="m" className="capitalize">{r.method}</span>,
          formatCurrency(Number(r.amount || 0)),
          <Badge key="v" variant={vBadge[r.verification] ?? "neutral"} className="capitalize">{r.verification}</Badge>,
        ])} />
    </>
  );
}
