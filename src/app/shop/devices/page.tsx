import { HardDrive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewDeviceForm } from "@/components/devices/new-device-form";
import { assignDevice } from "@/app/shop/devices/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type Row = { id: string; brand: string | null; model: string | null; imei1: string | null; status: string; assigned_employee_id: string | null; customer: { full_name: string } | null; assigned: { full_name: string | null } | null };
export default async function DevicesPage() {
  const supabase = createClient();
  const [{ data: devices }, { data: models }, { data: employees }] = await Promise.all([
    supabase.from("devices").select("id,brand,model,imei1,status,assigned_employee_id, customer:customers(full_name), assigned:profiles!devices_assigned_employee_id_fkey(full_name)").order("created_at", { ascending: false }),
    supabase.from("phone_models").select("id,brand,model_name").order("brand"),
    supabase.from("profiles").select("id,full_name").eq("role", "employee").order("full_name"),
  ]);
  const rows = (devices ?? []) as unknown as Row[];
  const emps = (employees ?? []) as { id: string; full_name: string | null }[];
  return (<>
    <NewDeviceForm models={(models ?? []) as { id: string; brand: string; model_name: string }[]} />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><HardDrive className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No devices yet</p><p className="text-sm text-muted-foreground">Register individual phones with their IMEI.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Device</th><th className="p-4 font-medium">IMEI</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Assigned to</th><th className="p-4 font-medium">Reassign</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0">
          <td className="p-4 font-medium">{r.brand} {r.model}</td>
          <td className="p-4 font-mono text-xs text-muted-foreground">{r.imei1 ?? "—"}</td>
          <td className="p-4 text-muted-foreground">{r.customer?.full_name ?? "—"}</td>
          <td className="p-4"><Badge variant="neutral" className="capitalize">{r.status.replace(/_/g, " ")}</Badge></td>
          <td className="p-4 text-muted-foreground">{r.assigned?.full_name ?? "—"}</td>
          <td className="p-4">
            <form action={assignDevice} className="flex items-center gap-2">
              <input type="hidden" name="device_id" value={r.id} />
              <select name="employee_id" defaultValue={r.assigned_employee_id ?? ""} className={selectCls}>
                <option value="">— unassigned —</option>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name ?? "employee"}</option>)}
              </select>
              <Button type="submit" size="sm" variant="outline">Assign</Button>
            </form>
          </td>
        </tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
    {emps.length === 0 && <p className="text-xs text-muted-foreground">Tip: create employees first (Employees page) to assign devices to them.</p>}
  </>);
}
