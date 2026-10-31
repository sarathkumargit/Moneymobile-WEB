import { Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam } from "@/lib/admin/platform";
import { formatCurrency } from "@/lib/shared/utils";

export const dynamic = "force-dynamic";
type Row = { id: string; brand: string; model_name: string; variant: string | null; ram: string | null; storage: string | null; retail_price: number | null; stock_qty: number | null; shop_id: string | null };

export default async function ModelsPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let q = supabase.from("phone_models").select("id,brand,model_name,variant,ram,storage,retail_price,stock_qty,shop_id").order("brand").limit(LIMIT);
  if (shop) q = q.eq("shop_id", shop);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  return (
    <>
      <Toolbar title="Phone models" hint={`${rows.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/models" /></Toolbar>
      <DataTable icon={Smartphone} emptyTitle="No phone models yet"
        cols={[{ label: "Model" }, { label: "Specs" }, { label: "Shop" }, { label: "Retail price", align: "right" }, { label: "Stock", align: "right" }]}
        rows={rows.map((r) => [
          <div key="m"><div className="font-medium">{r.brand} {r.model_name}</div>{r.variant && <div className="text-xs text-muted-foreground">{r.variant}</div>}</div>,
          muted([r.ram, r.storage].filter(Boolean).join(" / ") || null),
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          r.retail_price != null ? formatCurrency(Number(r.retail_price)) : "—",
          String(r.stock_qty ?? 0),
        ])} />
    </>
  );
}
