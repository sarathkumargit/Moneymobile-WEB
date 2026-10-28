import { Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewModelForm } from "@/components/new-model-form";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
export const dynamic = "force-dynamic";
type Row = { id: string; brand: string; model_name: string; variant: string | null; ram: string | null; storage: string | null; retail_price: number | null; stock_qty: number | null };
export default async function ModelsPage() {
  const supabase = createClient();
  const { data } = await supabase.from("phone_models").select("id,brand,model_name,variant,ram,storage,retail_price,stock_qty").order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  return (<>
    <NewModelForm />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Smartphone className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No phone models yet</p><p className="text-sm text-muted-foreground">Add the phones your shop sells.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Model</th><th className="p-4 font-medium">Specs</th><th className="p-4 font-medium text-right">Retail</th><th className="p-4 font-medium text-right">Stock</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4"><div className="font-medium">{r.brand} {r.model_name}</div>{r.variant && <div className="text-xs text-muted-foreground">{r.variant}</div>}</td><td className="p-4 text-muted-foreground">{[r.ram, r.storage].filter(Boolean).join(" · ") || "—"}</td><td className="p-4 text-right">{r.retail_price ? formatCurrency(Number(r.retail_price)) : "—"}</td><td className="p-4 text-right">{r.stock_qty ?? 0}</td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
