import { ShieldAlert, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProtectionTestForm } from "@/components/devices/protection-test-form";
import { deleteProtectionTest } from "./actions";
import { computeRisk, modelKey, METHOD_LABEL, RISK_META, HELD_VALID_DAYS, type TestRow, type VerdictRow, type TestMethod } from "@/lib/devices/model-risk";
import { signedDocUrl } from "@/lib/shared/storage";
export const dynamic = "force-dynamic";

type Test = TestRow & { id: string; brand: string; model: string; android_version: string | null; security_patch: string | null; tool_name: string | null; tool_version: string | null; notes: string | null; photo_path: string | null };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
}

export default async function ProtectionTestsPage() {
  const s = await getSessionProfile();
  const shopId = s?.profile.shop_id ?? null;
  const isOwner = s?.profile.role === "shop_admin";
  const supabase = createClient();
  const [testsRes, verdictsRes, devicesRes] = await Promise.all([
    supabase.from("model_protection_tests").select("id,brand,model,model_key,method,result,tested_at,android_version,security_patch,tool_name,tool_version,notes,photo_path").eq("shop_id", shopId ?? "00000000-0000-0000-0000-000000000000").order("tested_at", { ascending: false }).limit(500),
    supabase.from("model_protection_verdicts").select("model_key,verdict,reason"),
    supabase.from("devices").select("brand,model").limit(2000),
  ]);
  const notReady = !!testsRes.error;
  const tests = (testsRes.data ?? []) as Test[];
  const verdicts = (verdictsRes.data ?? []) as VerdictRow[];

  // Every model the shop has a phone of, plus every tested model.
  const models = new Map<string, { brand: string; model: string }>();
  for (const d of (devicesRes.data ?? []) as { brand: string | null; model: string | null }[]) {
    const k = modelKey(d.brand, d.model);
    if (k && d.brand && d.model && !models.has(k)) models.set(k, { brand: d.brand, model: d.model });
  }
  for (const t of tests) if (!models.has(t.model_key)) models.set(t.model_key, { brand: t.brand, model: t.model });

  const order = { not_allowed: 0, untested: 1, risky: 2, safe: 3 } as const;
  const summary = Array.from(models.entries()).map(([k, m]) => {
    const mine = tests.filter((t) => t.model_key === k);
    return { key: k, ...m, risk: computeRisk(mine, verdicts.find((v) => v.model_key === k) ?? null), last: mine[0]?.tested_at ?? null };
  }).sort((a, b) => order[a.risk.level] - order[b.risk.level] || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));

  const photos = await Promise.all(tests.slice(0, 100).map((t) => (t.photo_path ? signedDocUrl(t.photo_path) : Promise.resolve(null))));

  return (<>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Unlock tests</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Test one phone of each model with your own tools before selling it on installments. Use a phone you own, enrolled and locked like a customer phone.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><span className="font-medium text-foreground">Power + Volume reset</span> — does the phone still ask for the shop&apos;s Google account afterwards?</li>
          <li><span className="font-medium text-foreground">FRP unlock tool</span> — can your tool skip the Google account?</li>
          <li><span className="font-medium text-foreground">Firmware flash</span> — after flashing stock firmware, is the phone usable without the shop?</li>
        </ol>
        <p>A model is <span className="font-medium text-emerald-700">Safe</span> only when all three held within the last {HELD_VALID_DAYS} days. If any tool beat it, it is <span className="font-medium text-red-700">Not allowed</span> and only the shop owner can finance it, with a reason.</p>
      </CardContent>
    </Card>

    {notReady ? (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Run migration <span className="font-mono">0025_model_protection_tests.sql</span> in Supabase to start recording tests.</CardContent></Card>
    ) : (<>
      <ProtectionTestForm models={Array.from(models.values())} />

      <Card><CardHeader><CardTitle>Models</CardTitle></CardHeader><CardContent className="p-0">
        {summary.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No phones or tests yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Model</th><th className="p-4 font-medium">Risk</th><th className="p-4 font-medium">Why</th><th className="p-4 font-medium">Rule for agreements</th><th className="p-4 font-medium">Last test</th></tr></thead><tbody>
            {summary.map((r) => (<tr key={r.key} className="border-b last:border-0 align-top">
              <td className="p-4 font-medium">{r.brand} {r.model}<div className="text-xs font-normal text-muted-foreground">{r.risk.tested} test{r.risk.tested === 1 ? "" : "s"}</div></td>
              <td className="p-4"><Badge variant={RISK_META[r.risk.level].badge}>{r.risk.label}</Badge></td>
              <td className="p-4 text-xs text-muted-foreground">{r.risk.reasons.length ? r.risk.reasons.map((x) => <div key={x}>{x}</div>) : RISK_META[r.risk.level].hint}</td>
              <td className="p-4 text-xs text-muted-foreground">{r.risk.level === "not_allowed" ? "Owner override with reason" : `Down payment ≥ ${r.risk.minDepositPct}% · up to ${r.risk.maxMonths} months`}</td>
              <td className="p-4 text-xs text-muted-foreground">{fmtDate(r.last)}</td>
            </tr>))}
          </tbody></table></div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Test history</CardTitle></CardHeader><CardContent className="p-0">
        {tests.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tests recorded yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Model</th><th className="p-4 font-medium">Tried</th><th className="p-4 font-medium">Tool</th><th className="p-4 font-medium">Result</th><th className="p-4 font-medium">Notes</th>{isOwner && <th className="p-4" />}</tr></thead><tbody>
            {tests.map((t, i) => (<tr key={t.id} className="border-b last:border-0 align-top">
              <td className="p-4 text-xs whitespace-nowrap">{fmtDate(t.tested_at)}</td>
              <td className="p-4"><div className="font-medium">{t.brand} {t.model}</div><div className="text-xs text-muted-foreground">{[t.android_version && `Android ${t.android_version}`, t.security_patch && `patch ${t.security_patch}`].filter(Boolean).join(" · ") || "—"}</div></td>
              <td className="p-4 text-xs">{METHOD_LABEL[t.method as TestMethod] ?? t.method}</td>
              <td className="p-4 text-xs text-muted-foreground">{[t.tool_name, t.tool_version].filter(Boolean).join(" ") || "—"}</td>
              <td className="p-4">{t.result === "held" ? <Badge variant="success">Held</Badge> : <Badge variant="danger">Bypassed</Badge>}</td>
              <td className="p-4 text-xs text-muted-foreground max-w-xs">{t.notes ?? ""}{photos[i] && <div><a href={photos[i] as string} target="_blank" rel="noreferrer" className="text-primary underline">Photo</a></div>}</td>
              {isOwner && <td className="p-4"><form action={deleteProtectionTest}><input type="hidden" name="id" value={t.id} /><button className="text-muted-foreground hover:text-red-600" aria-label="Delete test" title="Delete this test"><Trash2 className="h-4 w-4" /></button></form></td>}
            </tr>))}
          </tbody></table></div>)}
      </CardContent></Card>
    </>)}
  </>);
}
