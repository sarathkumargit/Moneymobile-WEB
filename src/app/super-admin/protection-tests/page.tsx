import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setModelVerdict } from "./actions";
import { loadShops } from "@/lib/admin/platform";
import { computeRisk, METHOD_LABEL, RISK_META, type TestRow, type VerdictRow, type TestMethod } from "@/lib/devices/model-risk";
export const dynamic = "force-dynamic";

type Test = TestRow & { id: string; shop_id: string | null; brand: string; model: string; tool_name: string | null; android_version: string | null; security_patch: string | null; notes: string | null };
type Verdict = VerdictRow & { brand: string; model: string; set_at: string };
const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Colombo" }) : "—";
}

export default async function SuperProtectionTestsPage() {
  const supabase = createClient();
  const [testsRes, verdictsRes, shops] = await Promise.all([
    supabase.from("model_protection_tests").select("id,shop_id,brand,model,model_key,method,result,tested_at,tool_name,android_version,security_patch,notes").order("tested_at", { ascending: false }).limit(2000),
    supabase.from("model_protection_verdicts").select("model_key,brand,model,verdict,reason,set_at"),
    loadShops(),
  ]);
  if (testsRes.error) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Run migration <span className="font-mono">0025_model_protection_tests.sql</span> in Supabase first.</CardContent></Card>;
  }
  const tests = (testsRes.data ?? []) as Test[];
  const verdicts = (verdictsRes.data ?? []) as Verdict[];

  // One row per model across all shops: platform-wide result (all shops' tests together).
  const keys = new Map<string, { brand: string; model: string }>();
  for (const t of tests) if (!keys.has(t.model_key)) keys.set(t.model_key, { brand: t.brand, model: t.model });
  for (const v of verdicts) if (!keys.has(v.model_key)) keys.set(v.model_key, { brand: v.brand, model: v.model });
  const rows = Array.from(keys.entries()).map(([k, m]) => {
    const all = tests.filter((t) => t.model_key === k);
    const verdict = verdicts.find((v) => v.model_key === k) ?? null;
    return {
      key: k, ...m, verdict,
      fromTests: computeRisk(all, null),
      shopsTested: new Set(all.map((t) => t.shop_id)).size,
      bypasses: all.filter((t) => t.result === "bypassed").length,
      held: all.filter((t) => t.result === "held").length,
    };
  }).sort((a, b) => b.bypasses - a.bypasses || a.brand.localeCompare(b.brand));

  return (<>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Unlock tests — all shops</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Each shop records its own tests. Here you see every shop&apos;s results together and can set a <span className="font-medium text-foreground">platform verdict</span> that applies to all shops.</p>
        <p>A shop&apos;s own &quot;bypassed&quot; result always wins over a platform verdict of Safe or Risky (the stricter result applies).</p>
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle>Set a platform verdict</CardTitle></CardHeader><CardContent>
      <form action={setModelVerdict} className="flex flex-wrap items-end gap-2">
        <Input name="brand" placeholder="Brand (e.g. samsung)" className="h-9 w-40" required />
        <Input name="model" placeholder="Model (e.g. SM-M175F)" className="h-9 w-48" required />
        <select name="verdict" className={selectCls} defaultValue="not_allowed">
          <option value="safe">Safe</option><option value="risky">Risky</option><option value="not_allowed">Not allowed</option><option value="clear">Remove verdict</option>
        </select>
        <Input name="reason" placeholder="Reason (shown to shops)" className="h-9 w-72" />
        <Button size="sm" type="submit">Save</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Models</CardTitle></CardHeader><CardContent className="p-0">
      {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tests recorded yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Model</th><th className="p-4 font-medium">From all tests</th><th className="p-4 font-medium">Held / bypassed</th><th className="p-4 font-medium">Shops</th><th className="p-4 font-medium">Platform verdict</th><th className="p-4 font-medium">Change</th></tr></thead><tbody>
          {rows.map((r) => (<tr key={r.key} className="border-b last:border-0 align-top">
            <td className="p-4 font-medium">{r.brand} {r.model}</td>
            <td className="p-4"><Badge variant={RISK_META[r.fromTests.level].badge}>{r.fromTests.label}</Badge></td>
            <td className="p-4 text-xs">{r.held} / <span className={r.bypasses ? "font-semibold text-red-700" : ""}>{r.bypasses}</span></td>
            <td className="p-4 text-xs">{r.shopsTested}</td>
            <td className="p-4 text-xs">{r.verdict ? <><Badge variant={RISK_META[r.verdict.verdict].badge}>{RISK_META[r.verdict.verdict].label}</Badge>{r.verdict.reason && <div className="mt-1 text-muted-foreground">{r.verdict.reason}</div>}<div className="text-muted-foreground">{fmtDate(r.verdict.set_at)}</div></> : <span className="text-muted-foreground">—</span>}</td>
            <td className="p-4"><form action={setModelVerdict} className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="brand" value={r.brand} /><input type="hidden" name="model" value={r.model} />
              <select name="verdict" className={selectCls} defaultValue={r.verdict?.verdict ?? "risky"}>
                <option value="safe">Safe</option><option value="risky">Risky</option><option value="not_allowed">Not allowed</option>{r.verdict && <option value="clear">Remove</option>}
              </select>
              <Input name="reason" placeholder="Reason" defaultValue={r.verdict?.reason ?? ""} className="h-9 w-40" />
              <Button size="sm" variant="outline" type="submit">Save</Button>
            </form></td>
          </tr>))}
        </tbody></table></div>)}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Latest tests</CardTitle></CardHeader><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
        <th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Shop</th><th className="p-4 font-medium">Model</th><th className="p-4 font-medium">Tried</th><th className="p-4 font-medium">Tool</th><th className="p-4 font-medium">Result</th><th className="p-4 font-medium">Notes</th></tr></thead><tbody>
        {tests.slice(0, 200).map((t) => (<tr key={t.id} className="border-b last:border-0 align-top">
          <td className="p-4 text-xs whitespace-nowrap">{fmtDate(t.tested_at)}</td>
          <td className="p-4 text-xs">{t.shop_id ? (shops.names[t.shop_id] ?? "—") : "Platform"}</td>
          <td className="p-4"><div className="font-medium">{t.brand} {t.model}</div><div className="text-xs text-muted-foreground">{[t.android_version && `Android ${t.android_version}`, t.security_patch && `patch ${t.security_patch}`].filter(Boolean).join(" · ")}</div></td>
          <td className="p-4 text-xs">{METHOD_LABEL[t.method as TestMethod] ?? t.method}</td>
          <td className="p-4 text-xs text-muted-foreground">{t.tool_name ?? "—"}</td>
          <td className="p-4">{t.result === "held" ? <Badge variant="success">Held</Badge> : <Badge variant="danger">Bypassed</Badge>}</td>
          <td className="p-4 text-xs text-muted-foreground max-w-xs">{t.notes ?? ""}</td>
        </tr>))}
      </tbody></table></div>
    </CardContent></Card>
  </>);
}
