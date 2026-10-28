import { ShieldCheck, Lock, Unlock, Smartphone, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewEnrollmentForm } from "@/components/new-enrollment-form";
import { issueCommand, resolveSecurityEvent, resetDeviceRecord } from "@/app/shop/device-management/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Enr = { id: string; status: string; model: string | null; imei1: string | null; sim_operator: string | null; battery_level: number | null; last_sync: string | null; agreement_id: string | null; device_id: string | null; customer: { full_name: string } | null };
type Evt = { id: string; event_type: string | null; details: string | null; status: string; created_at: string; devices: { imei1: string | null } | null };

function online(last: string | null) { return last ? Date.now() - new Date(last).getTime() < 8 * 3600 * 1000 : false; }

export default async function DeviceManagementPage() {
  const supabase = createClient();
  const [{ data: enrollments }, { data: devices }, { data: agreements }, { data: events }, { data: commands }] = await Promise.all([
    supabase.from("device_enrollments").select("id,status,model,imei1,sim_operator,battery_level,last_sync,agreement_id,device_id, customer:customers(full_name)").order("created_at", { ascending: false }),
    supabase.from("devices").select("id,brand,model,imei1").order("created_at", { ascending: false }),
    supabase.from("installment_agreements").select("id,agreement_code, customers(full_name)").eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("device_security_events").select("id,event_type,details,status,created_at, devices(imei1)").order("created_at", { ascending: false }).limit(20),
    supabase.from("device_commands").select("id,command,status,created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const enr = (enrollments ?? []) as unknown as Enr[];
  const evts = (events ?? []) as unknown as Evt[];
  const cmds = (commands ?? []) as Array<{ id: string; command: string; status: string; created_at: string }>;
  const deviceOpts = (devices ?? []).map((d: { id: string; brand: string | null; model: string | null; imei1: string | null }) => ({ id: d.id, label: `${d.brand ?? ""} ${d.model ?? ""}${d.imei1 ? ` · ${d.imei1}` : ""}` }));
  const agrOpts = ((agreements ?? []) as unknown as Array<{ id: string; agreement_code: string | null; customers: { full_name: string } | null }>).map((a) => ({ id: a.id, label: `${a.agreement_code ?? ""} · ${a.customers?.full_name ?? ""}` }));
  const pendingApprovals = evts.filter((e) => e.status === "approval_required").length;

  return (<>
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      Live device control requires the MoneyMobile app enrolled as Device Owner and pointed at this platform&apos;s API URL. Commands below are delivered to the phone on its next heartbeat.
    </div>

    <NewEnrollmentForm devices={deviceOpts} agreements={agrOpts} />

    {/* Enrolled devices */}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Enrolled devices</CardTitle></CardHeader><CardContent className="p-0">
      {enr.length === 0 ? (<div className="flex flex-col items-center justify-center py-14 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><ShieldCheck className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No devices enrolled yet</p><p className="text-sm text-muted-foreground">Generate an enrollment token and enroll a phone via the app.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Customer</th><th className="p-3 font-medium">Device</th><th className="p-3 font-medium">SIM</th><th className="p-3 font-medium">Last sync</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Control</th></tr></thead><tbody>
        {enr.map((e) => (<tr key={e.id} className="border-b last:border-0">
          <td className="p-3 font-medium">{e.customer?.full_name ?? "—"}</td>
          <td className="p-3">{e.model ?? "—"}<div className="font-mono text-xs text-muted-foreground">{e.imei1 ?? ""}</div></td>
          <td className="p-3 text-muted-foreground">{e.sim_operator ?? "—"}</td>
          <td className="p-3 text-muted-foreground">{e.last_sync ? new Date(e.last_sync).toLocaleString() : "never"}</td>
          <td className="p-3">
            {e.status === "enrolled"
              ? <Badge variant={online(e.last_sync) ? "success" : "neutral"}>{online(e.last_sync) ? "online" : "offline"}</Badge>
              : <Badge variant="warning" className="capitalize">{e.status}</Badge>}
          </td>
          <td className="p-3">
            <div className="flex flex-wrap gap-2">
              {e.status === "enrolled" && (<>
                <form action={issueCommand}><input type="hidden" name="enrollment_id" value={e.id} /><input type="hidden" name="device_id" value={e.device_id ?? ""} /><input type="hidden" name="agreement_id" value={e.agreement_id ?? ""} /><input type="hidden" name="command" value="LOCK_DEVICE" /><Button type="submit" size="sm" variant="destructive"><Lock className="h-3.5 w-3.5" /> Lock</Button></form>
                <form action={issueCommand}><input type="hidden" name="enrollment_id" value={e.id} /><input type="hidden" name="device_id" value={e.device_id ?? ""} /><input type="hidden" name="agreement_id" value={e.agreement_id ?? ""} /><input type="hidden" name="command" value="UNLOCK_DEVICE" /><Button type="submit" size="sm" variant="outline"><Unlock className="h-3.5 w-3.5" /> Unlock</Button></form>
              </>)}
              {e.device_id && (
                <form action={resetDeviceRecord}><input type="hidden" name="device_id" value={e.device_id} /><Button type="submit" size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400">Reset for resale</Button></form>
              )}
              {e.status !== "enrolled" && !e.device_id && <span className="text-xs text-muted-foreground">awaiting enrollment</span>}
            </div>
          </td>
        </tr>))}
      </tbody></table></div>)}
    </CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-2">
      {/* Security / SIM events */}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> SIM-change & security events{pendingApprovals > 0 && <Badge variant="warning">{pendingApprovals} pending</Badge>}</CardTitle></CardHeader><CardContent className="p-0">
        {evts.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No events reported.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
          {evts.map((ev) => (<tr key={ev.id} className="border-b last:border-0">
            <td className="p-3"><div className="font-medium capitalize">{(ev.event_type ?? "event").replace(/_/g, " ")}</div><div className="text-xs text-muted-foreground">{ev.details ?? ""}</div><div className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</div></td>
            <td className="p-3 text-right">
              {ev.status === "approval_required" ? (
                <div className="flex justify-end gap-2">
                  <form action={resolveSecurityEvent}><input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="decision" value="approved" /><Button type="submit" size="sm" variant="outline">Approve</Button></form>
                  <form action={resolveSecurityEvent}><input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="decision" value="rejected" /><Button type="submit" size="sm" variant="destructive">Reject</Button></form>
                </div>
              ) : <Badge variant={ev.status === "approved" ? "success" : ev.status === "rejected" ? "danger" : "neutral"} className="capitalize">{ev.status}</Badge>}
            </td>
          </tr>))}
        </tbody></table></div>)}
      </CardContent></Card>

      {/* Recent commands */}
      <Card><CardHeader><CardTitle>Recent commands</CardTitle></CardHeader><CardContent className="p-0">
        {cmds.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No commands issued.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
          {cmds.map((c) => (<tr key={c.id} className="border-b last:border-0"><td className="p-3 font-medium capitalize">{c.command.replace(/_/g, " ").toLowerCase()}</td><td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td><td className="p-3 text-right"><Badge variant={c.status === "acked" ? "success" : c.status === "failed" ? "danger" : "neutral"} className="capitalize">{c.status}</Badge></td></tr>))}
        </tbody></table></div>)}
      </CardContent></Card>
    </div>
  </>);
}
