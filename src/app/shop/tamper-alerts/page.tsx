import Link from "next/link";
import { Siren, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatSL } from "@/lib/shared/srilanka-time";
import { TAMPER_RULES, SEVERITY_BADGE, scanSilentPhones, type TamperRule, type Severity } from "@/lib/devices/tamper";
import { updateTamperAlert, saveTamperSettings } from "./actions";
export const dynamic = "force-dynamic";

type Ev = { id: string; enrollment_id: string | null; device_id: string | null; agreement_id: string | null; rule: string; severity: Severity; points: number; details: Record<string, unknown> | null; status: string; occurrences: number; last_seen_at: string; created_at: string; resolution_note: string | null; action_taken: string | null };
type EnrRow = { id: string; model: string | null; imei1: string | null; tamper_score: number | null; last_sync: string | null; customer: { id: string; full_name: string } | null };

export default async function TamperAlertsPage() {
  const s = await getSessionProfile();
  const shopId = s?.profile.shop_id ?? null;
  const isOwner = s?.profile.role === "shop_admin";
  // Look for phones that went silent while money is owed (cheap; also runs from the daily cron).
  if (shopId) await scanSilentPhones(createAdminClient(), shopId);

  const supabase = createClient();
  const [openRes, closedRes, shopRes] = await Promise.all([
    supabase.from("device_tamper_events").select("id,enrollment_id,device_id,agreement_id,rule,severity,points,details,status,occurrences,last_seen_at,created_at,resolution_note,action_taken").in("status", ["open", "acknowledged"]).order("last_seen_at", { ascending: false }).limit(300),
    supabase.from("device_tamper_events").select("id,enrollment_id,device_id,agreement_id,rule,severity,points,details,status,occurrences,last_seen_at,created_at,resolution_note,action_taken").in("status", ["resolved", "dismissed"]).order("last_seen_at", { ascending: false }).limit(50),
    shopId ? supabase.from("shops").select("tamper_auto_lock,tamper_lock_threshold,strict_usb").eq("id", shopId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (openRes.error) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Run migrations <span className="font-mono">0026_device_keys.sql</span> and <span className="font-mono">0027_tamper_detection.sql</span> in Supabase to turn on tamper detection.</CardContent></Card>;
  }
  const open = (openRes.data ?? []) as Ev[];
  const closed = (closedRes.data ?? []) as Ev[];
  const settings = (shopRes.data ?? null) as { tamper_auto_lock: boolean; tamper_lock_threshold: number; strict_usb: boolean } | null;

  const enrIds = Array.from(new Set([...open, ...closed].map((e) => e.enrollment_id).filter((x): x is string => !!x)));
  const enrMap: Record<string, EnrRow> = {};
  if (enrIds.length) {
    const { data } = await supabase.from("device_enrollments").select("id,model,imei1,tamper_score,last_sync, customer:customers(id,full_name)").in("id", enrIds);
    for (const r of (data ?? []) as unknown as EnrRow[]) enrMap[r.id] = r;
  }
  const phones = Object.values(enrMap).filter((r) => Number(r.tamper_score || 0) > 0).sort((a, b) => Number(b.tamper_score) - Number(a.tamper_score));
  const label = (rule: string) => TAMPER_RULES[rule as TamperRule]?.label ?? rule.replace(/_/g, " ");
  const advice = (rule: string) => TAMPER_RULES[rule as TamperRule]?.advice ?? "";
  const phone = (id: string | null) => {
    const r = id ? enrMap[id] : undefined;
    return r ? <><div className="font-medium">{r.customer ? <Link className="hover:underline" href={`/shop/customers/${r.customer.id}`}>{r.customer.full_name}</Link> : "—"}</div><div className="text-xs text-muted-foreground">{r.model ?? "phone"} · <span className="font-mono">{r.imei1 ?? ""}</span></div></> : <span className="text-muted-foreground">—</span>;
  };

  return (<>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Siren className="h-5 w-5 text-primary" /> Tamper alerts</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>MoneyMobile watches every financed phone for signs of a reset, a flash or tampering: no check-in for days, a missing or wrong hardware signature, the phone registering again, an unlocked bootloader, USB debugging switched on, and more.</p>
        <p>Each sign has points. A phone&apos;s <span className="font-medium text-foreground">tamper score</span> is the total of its open alerts from the last 30 days (max 100). Resolve or dismiss an alert once you have checked it.</p>
      </CardContent>
    </Card>

    {isOwner && settings && (
      <Card><CardHeader><CardTitle>Settings</CardTitle></CardHeader><CardContent>
        <form action={saveTamperSettings} className="space-y-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" name="tamper_auto_lock" defaultChecked={settings.tamper_auto_lock} className="mt-1" />
            <span><span className="font-medium">Lock the phone automatically</span> when its tamper score reaches the threshold (only phones that still owe money). Staff must unlock it after checking.</span></label>
          <div className="flex items-center gap-2 pl-6"><span>Threshold</span><Input type="number" name="tamper_lock_threshold" min={20} max={100} defaultValue={settings.tamper_lock_threshold} className="h-9 w-24" /><span className="text-xs text-muted-foreground">points (20–100)</span></div>
          <label className="flex items-start gap-2"><input type="checkbox" name="strict_usb" defaultChecked={settings.strict_usb} className="mt-1" />
            <span><span className="font-medium">Block USB debugging and USB file transfer at all times</span> (app 1.11.0+). Most PC unlock tools need USB debugging. Use &quot;USB service 30 min&quot; on Device Mgmt when you need to connect a phone in the shop.</span></label>
          <Button type="submit" size="sm">Save settings</Button>
        </form>
      </CardContent></Card>
    )}

    {phones.length > 0 && (
      <Card><CardHeader><CardTitle>Phones at risk</CardTitle></CardHeader><CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Phone</th><th className="p-3 font-medium">Tamper score</th><th className="p-3 font-medium">Last check-in</th></tr></thead><tbody>
          {phones.map((p) => (<tr key={p.id} className="border-b last:border-0"><td className="p-3">{phone(p.id)}</td>
            <td className="p-3"><Badge variant={Number(p.tamper_score) >= 60 ? "danger" : Number(p.tamper_score) >= 30 ? "warning" : "neutral"}>{p.tamper_score}</Badge></td>
            <td className="p-3 text-xs text-muted-foreground">{p.last_sync ? formatSL(p.last_sync) : "never"}</td></tr>))}
        </tbody></table></div>
      </CardContent></Card>
    )}

    <Card><CardHeader><CardTitle className="flex items-center gap-2">Open alerts {open.length > 0 && <Badge variant="danger">{open.length}</Badge>}</CardTitle></CardHeader><CardContent className="p-0">
      {open.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><ShieldCheck className="h-6 w-6 text-emerald-600" /></div><p className="mt-3 font-medium">No open alerts</p><p className="text-sm text-muted-foreground">Every phone looks normal.</p></div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Phone</th><th className="p-3 font-medium">What happened</th><th className="p-3 font-medium">Seen</th><th className="p-3 font-medium">Action</th></tr></thead><tbody>
          {open.map((e) => (<tr key={e.id} className="border-b last:border-0 align-top">
            <td className="p-3">{phone(e.enrollment_id)}</td>
            <td className="p-3 max-w-md">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{label(e.rule)}</span><Badge variant={SEVERITY_BADGE[e.severity]} className="capitalize">{e.severity} · {e.points}</Badge>{e.status === "acknowledged" && <Badge variant="neutral">acknowledged</Badge>}{e.action_taken === "auto_locked" && <Badge variant="danger">auto-locked</Badge>}</div>
              <p className="mt-1 text-xs text-muted-foreground">{advice(e.rule)}</p>
            </td>
            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{formatSL(e.created_at)}{e.occurrences > 1 && <div>{e.occurrences}× · last {formatSL(e.last_seen_at)}</div>}</td>
            <td className="p-3">
              <form action={updateTamperAlert} className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="id" value={e.id} />
                <Input name="note" placeholder="Note (optional)" className="h-9 w-40" />
                {e.status === "open" && <Button size="sm" variant="outline" name="action" value="acknowledge">Acknowledge</Button>}
                <Button size="sm" variant="outline" name="action" value="resolve">Resolve</Button>
                <Button size="sm" variant="ghost" name="action" value="dismiss">False alarm</Button>
              </form>
            </td>
          </tr>))}
        </tbody></table></div>
      )}
    </CardContent></Card>

    {closed.length > 0 && (
      <Card><CardHeader><CardTitle>Recently closed</CardTitle></CardHeader><CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
          {closed.map((e) => (<tr key={e.id} className="border-b last:border-0"><td className="p-3">{phone(e.enrollment_id)}</td><td className="p-3">{label(e.rule)}</td>
            <td className="p-3"><Badge variant={e.status === "dismissed" ? "neutral" : "success"} className="capitalize">{e.status === "dismissed" ? "false alarm" : e.status}</Badge></td>
            <td className="p-3 text-xs text-muted-foreground">{e.resolution_note ?? ""}</td><td className="p-3 text-xs text-muted-foreground">{formatSL(e.last_seen_at)}</td></tr>))}
        </tbody></table></div>
      </CardContent></Card>
    )}
  </>);
}
