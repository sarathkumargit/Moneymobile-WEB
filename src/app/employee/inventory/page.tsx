import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function EmployeeInventoryPage() {
  const supabase = createClient();
  const [{ data: models }, { data: devices }] = await Promise.all([
    supabase.from("phone_models").select("id,brand,model_name,stock_qty,retail_price").order("brand"),
    supabase.from("devices").select("id,status"),
  ]);
  const statusCounts: Record<string, number> = {};
  (devices ?? []).forEach((d: { status: string }) => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
  return (<div className="grid gap-6 lg:grid-cols-3">
    <Card className="lg:col-span-2"><CardHeader><CardTitle>Phone catalog</CardTitle></CardHeader><CardContent className="p-0">
      {(models ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No models in the catalog yet.</p> : (
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Model</th><th className="p-4 font-medium text-right">Retail</th><th className="p-4 font-medium text-right">Stock</th></tr></thead><tbody>
        {(models ?? []).map((m: { id: string; brand: string; model_name: string; retail_price: number | null; stock_qty: number | null }) => (<tr key={m.id} className="border-b last:border-0"><td className="p-4 font-medium">{m.brand} {m.model_name}</td><td className="p-4 text-right">{m.retail_price ? formatCurrency(Number(m.retail_price)) : "—"}</td><td className="p-4 text-right">{m.stock_qty ?? 0}</td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>My devices by status</CardTitle></CardHeader><CardContent className="space-y-3">
      {Object.keys(statusCounts).length === 0 ? <p className="text-sm text-muted-foreground">No devices yet.</p> : Object.entries(statusCounts).map(([k, v]) => (<div key={k} className="flex items-center justify-between"><Badge variant="neutral" className="capitalize">{k.replace(/_/g, " ")}</Badge><span className="font-medium">{v}</span></div>))}
    </CardContent></Card>
  </div>);
}
