import { HardDrive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewDeviceForm } from "@/components/devices/new-device-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export const dynamic = "force-dynamic";
type Row = { id: string; brand: string | null; model: string | null; imei1: string | null; status: string; customer: { full_name: string } | null };
export default async function EmployeeDevicesPage() {
  const supabase = createClient();
  const [{ data: devices }, { data: models }] = await Promise.all([
    supabase.from("devices").select("id,brand,model,imei1,status, customer:customers(full_name)").order("created_at", { ascending: false }),
    supabase.from("phone_models").select("id,brand,model_name").order("brand"),
  ]);
  const rows = (devices ?? []) as unknown as Row[];
  return (<>
    <NewDeviceForm models={(models ?? []) as { id: string; brand: string; model_name: string }[]} />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><HardDrive className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No assigned devices yet</p><p className="text-sm text-muted-foreground">Devices you register or are assigned appear here.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Device</th><th className="p-4 font-medium">IMEI</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Status</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-medium">{r.brand} {r.model}</td><td className="p-4 font-mono text-xs text-muted-foreground">{r.imei1 ?? "—"}</td><td className="p-4 text-muted-foreground">{r.customer?.full_name ?? "—"}</td><td className="p-4"><Badge variant="neutral" className="capitalize">{r.status.replace(/_/g, " ")}</Badge></td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
