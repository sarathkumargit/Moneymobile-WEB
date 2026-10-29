import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/shared/utils";
export const dynamic = "force-dynamic";
export default async function InventoryPage() {
  const supabase = createClient();
  const [{ data: models }, { data: devices }] = await Promise.all([
    supabase.from("phone_models").select("id,brand,model_name,stock_qty,retail_price").order("brand"),
    supabase.from("devices").select("id,status"),
  ]);
  const statusCounts: Record<string, number> = {};
  (devices ?? []).forEach((d: { status: string }) => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
  const totalStock = (models ?? []).reduce((s: number, m: { stock_qty: number | null }) => s + (m.stock_qty || 0), 0);
  return (<>
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Catalog models</p><p className="mt-1 text-2xl font-bold">{(models ?? []).length}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Catalog stock units</p><p className="mt-1 text-2xl font-bold">{totalStock}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Registered devices</p><p className="mt-1 text-2xl font-bold">{(devices ?? []).length}</p></CardContent></Card>
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader><CardTitle>Phone catalog</CardTitle></CardHeader><CardContent className="p-0">
        {(models ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No models in the catalog yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Model</th><th className="p-4 font-medium text-right">Retail</th><th className="p-4 font-medium text-right">Stock</th></tr></thead><tbody>
          {(models ?? []).map((m: { id: string; brand: string; model_name: string; retail_price: number | null; stock_qty: number | null }) => (<tr key={m.id} className="border-b last:border-0"><td className="p-4 font-medium">{m.brand} {m.model_name}</td><td className="p-4 text-right">{m.retail_price ? formatCurrency(Number(m.retail_price)) : "—"}</td><td className="p-4 text-right">{m.stock_qty ?? 0}</td></tr>))}
        </tbody></table></div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Devices by status</CardTitle></CardHeader><CardContent className="space-y-3">
        {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-muted-foreground">No devices yet.</p> : Object.entries(statusCounts).map(([k, v]) => (<div key={k} className="flex items-center justify-between"><Badge variant="neutral" className="capitalize">{k.replace(/_/g, " ")}</Badge><span className="font-medium">{v}</span></div>))}
      </CardContent></Card>
    </div>
  </>);
}
