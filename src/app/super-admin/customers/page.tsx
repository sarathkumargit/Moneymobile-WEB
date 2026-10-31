import { UserSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam } from "@/lib/admin/platform";
import { formatSLDate } from "@/lib/shared/srilanka-time";

export const dynamic = "force-dynamic";
type Row = { id: string; full_name: string; national_id: string | null; phone: string | null; verification: "pending" | "verified" | "rejected"; created_at: string; shop_id: string | null };
const vBadge = { verified: "success", pending: "warning", rejected: "danger" } as const;

export default async function CustomersPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let q = supabase.from("customers").select("id,full_name,national_id,phone,verification,created_at,shop_id").order("created_at", { ascending: false }).limit(LIMIT);
  if (shop) q = q.eq("shop_id", shop);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  return (
    <>
      <Toolbar title="Customers" hint={`${rows.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/customers" /></Toolbar>
      <DataTable icon={UserSquare} emptyTitle="No customers yet"
        cols={[{ label: "Name" }, { label: "NIC" }, { label: "Phone" }, { label: "Shop" }, { label: "Verification" }, { label: "Registered" }]}
        rows={rows.map((r) => [
          <span key="n" className="font-medium">{r.full_name}</span>,
          <span key="id" className="font-mono text-xs text-muted-foreground">{r.national_id ?? "—"}</span>,
          muted(r.phone),
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          <Badge key="v" variant={vBadge[r.verification] ?? "neutral"} className="capitalize">{r.verification}</Badge>,
          muted(formatSLDate(r.created_at)),
        ])} />
    </>
  );
}
