import { Boxes, Smartphone, PackageCheck, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, Toolbar, muted } from "@/components/super-admin/parts";
import { loadShops, words } from "@/lib/admin/platform";

export const dynamic = "force-dynamic";

// Stock overview per shop: how many models, units in stock, and phones by status.
export default async function InventoryPage() {
  const supabase = createClient();
  const { list } = await loadShops();
  const [{ data: models }, { data: devices }] = await Promise.all([
    supabase.from("phone_models").select("shop_id,stock_qty"),
    supabase.from("devices").select("shop_id,status"),
  ]);
  const perShop: Record<string, { models: number; stock: number; phones: number; status: Record<string, number> }> = {};
  const slot = (id: string) => (perShop[id] ??= { models: 0, stock: 0, phones: 0, status: {} });
  (models ?? []).forEach((m: { shop_id: string | null; stock_qty: number | null }) => { if (!m.shop_id) return; const s = slot(m.shop_id); s.models++; s.stock += m.stock_qty || 0; });
  (devices ?? []).forEach((d: { shop_id: string | null; status: string }) => { if (!d.shop_id) return; const s = slot(d.shop_id); s.phones++; s.status[d.status] = (s.status[d.status] || 0) + 1; });

  const all = Object.values(perShop);
  const sum = (f: (x: (typeof all)[number]) => number) => all.reduce((t, x) => t + f(x), 0);
  const inStock = sum((x) => x.status["in_stock"] || 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Phone models" value={String(sum((x) => x.models))} icon={Smartphone} hint="across all shops" />
        <StatCard label="Units in stock (models)" value={String(sum((x) => x.stock))} icon={Boxes} />
        <StatCard label="Phones registered" value={String(sum((x) => x.phones))} icon={Layers} />
        <StatCard label="Phones in stock" value={String(inStock)} icon={PackageCheck} tone="success" />
      </div>
      <Toolbar title="Stock by shop" />
      <DataTable icon={Boxes} emptyTitle="No stock yet"
        cols={[{ label: "Shop" }, { label: "Models", align: "right" }, { label: "Units in stock", align: "right" }, { label: "Phones registered", align: "right" }, { label: "By status" }]}
        rows={list.map((s) => {
          const x = perShop[s.id] ?? { models: 0, stock: 0, phones: 0, status: {} };
          const by = Object.entries(x.status).map(([k, v]) => `${words(k)} ${v}`).join(" · ");
          return [<span key="n" className="font-medium">{s.name}</span>, String(x.models), String(x.stock), String(x.phones), muted(by || null)];
        })} />
    </>
  );
}
