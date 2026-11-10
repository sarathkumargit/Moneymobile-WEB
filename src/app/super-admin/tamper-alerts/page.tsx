import { Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadShops } from "@/lib/admin/platform";
import { formatSL } from "@/lib/shared/srilanka-time";
import { TAMPER_RULES, SEVERITY_BADGE, type TamperRule, type Severity } from "@/lib/devices/tamper";
export const dynamic = "force-dynamic";

type Ev = { id: string; shop_id: string; enrollment_id: string | null; rule: string; severity: Severity; points: number; status: string; occurrences: number; created_at: string; last_seen_at: string; action_taken: string | null };

// All shops' tamper alerts (read-only). Shops handle their own alerts on their Tamper Alerts page.
export default async function SuperTamperAlertsPage() {
  const supabase = createClient();
  const [res, shops] = await Promise.all([
    supabase.from("device_tamper_events").select("id,shop_id,enrollment_id,rule,severity,points,status,occurrences,created_at,last_seen_at,action_taken").order("last_seen_at", { ascending: false }).limit(300),
    loadShops(),
  ]);
  if (res.error) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Run migrations <span className="font-mono">0026</span> and <span className="font-mono">0027</span> in Supabase first.</CardContent></Card>;
  const rows = (res.data ?? []) as Ev[];
  const openCount = rows.filter((r) => r.status === "open" || r.status === "acknowledged").length;
  const byRule = new Map<string, number>();
  for (const r of rows) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + 1);
  return (<>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Siren className="h-5 w-5 text-primary" /> Tamper alerts — all shops {openCount > 0 && <Badge variant="danger">{openCount} open</Badge>}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-xs">{Array.from(byRule.entries()).sort((a, b) => b[1] - a[1]).map(([rule, n]) => <Badge key={rule} variant="neutral">{TAMPER_RULES[rule as TamperRule]?.label ?? rule}: {n}</Badge>)}</CardContent></Card>
    <Card><CardContent className="p-0">
      {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No alerts yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Shop</th><th className="p-3 font-medium">Alert</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">First seen</th><th className="p-3 font-medium">Last seen</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.id} className="border-b last:border-0">
            <td className="p-3">{shops.names[r.shop_id] ?? "—"}</td>
            <td className="p-3"><span className="font-medium">{TAMPER_RULES[r.rule as TamperRule]?.label ?? r.rule}</span> <Badge variant={SEVERITY_BADGE[r.severity]} className="capitalize">{r.severity}</Badge>{r.action_taken === "auto_locked" && <Badge variant="danger" className="ml-1">auto-locked</Badge>}{r.occurrences > 1 && <span className="ml-1 text-xs text-muted-foreground">{r.occurrences}×</span>}</td>
            <td className="p-3 capitalize text-xs">{r.status}</td>
            <td className="p-3 text-xs text-muted-foreground">{formatSL(r.created_at)}</td>
            <td className="p-3 text-xs text-muted-foreground">{formatSL(r.last_seen_at)}</td>
          </tr>))}
        </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
