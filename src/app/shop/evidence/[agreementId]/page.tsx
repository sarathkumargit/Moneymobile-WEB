import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/shared/print-button";
import { formatSL } from "@/lib/shared/srilanka-time";
import { formatCurrency } from "@/lib/shared/utils";
export const dynamic = "force-dynamic";

type Row = { seq: number; source: string; event: string; actor_id: string | null; details: Record<string, unknown> | null; occurred_at: string; prev_hash: string; hash: string };

function brief(d: Record<string, unknown> | null): string {
  if (!d) return "";
  const inner = (d.details ?? d) as unknown;
  const s = typeof inner === "string" ? inner : JSON.stringify(inner);
  return s === "{}" || s === "null" ? "" : s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/** One agreement's tamper-proof history (migration 0028), verified against the hash chain. Printable. */
export default async function EvidencePage({ params }: { params: { agreementId: string } }) {
  const id = params.agreementId;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createClient();
  const { data: agr } = await supabase.from("installment_agreements")
    .select("id,agreement_code,status,total_price,deposit,total_repayment,outstanding_balance,installment_months,created_at,device_id,customer_id, customers(full_name,national_id,phone), shops(name,phone)")
    .eq("id", id).maybeSingle();
  if (!agr) notFound();
  const a = agr as unknown as { id: string; agreement_code: string | null; status: string; total_price: number; deposit: number; total_repayment: number | null; outstanding_balance: number; installment_months: number | null; created_at: string; device_id: string | null; customer_id: string; customers: { full_name: string; national_id?: string | null; phone?: string | null } | null; shops: { name: string; phone: string | null } | null };

  let enrIds: string[] = [];
  type Dev = { brand: string | null; model: string | null; imei1: string | null; imei2: string | null };
  let device: Dev | null = null as Dev | null;
  if (a.device_id) {
    const [{ data: enrs }, { data: dev }] = await Promise.all([
      supabase.from("device_enrollments").select("id").eq("device_id", a.device_id),
      supabase.from("devices").select("brand,model,imei1,imei2").eq("id", a.device_id).maybeSingle(),
    ]);
    enrIds = (enrs ?? []).map((e: { id: string }) => e.id);
    device = (dev as Dev | null) ?? null;
  }
  const filters = [`agreement_id.eq.${id}`];
  if (a.device_id) filters.push(`device_id.eq.${a.device_id}`);
  if (enrIds.length) filters.push(`enrollment_id.in.(${enrIds.join(",")})`);
  const { data: chain, error } = await supabase.from("evidence_chain").select("seq,source,event,actor_id,details,occurred_at,prev_hash,hash").or(filters.join(",")).order("seq", { ascending: true }).limit(2000);
  if (error) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Run migration <span className="font-mono">0028_evidence_chain.sql</span> in Supabase to keep a tamper-proof record. Events are recorded from then on.</CardContent></Card>;
  }
  const rows = (chain ?? []) as Row[];
  const [{ data: checks }, { data: head }] = await Promise.all([
    rows.length ? supabase.rpc("evidence_verify_rows", { p_seqs: rows.map((r) => r.seq) }) : Promise.resolve({ data: [] }),
    supabase.from("evidence_chain").select("seq,hash").order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ok = new Map<number, boolean>(((checks ?? []) as { seq: number; ok: boolean }[]).map((c) => [Number(c.seq), !!c.ok]));
  const broken = rows.filter((r) => ok.get(r.seq) === false).length;

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const actors: Record<string, string> = {};
  if (actorIds.length) {
    const { data: ps } = await supabase.from("profiles").select("id,full_name,username").in("id", actorIds);
    for (const p of (ps ?? []) as { id: string; full_name: string | null; username: string | null }[]) actors[p.id] = p.full_name || p.username || "staff";
  }
  const generated = new Date().toISOString();

  return (<>
    <div className="flex items-center justify-between print:hidden">
      <Link href={`/shop/customers/${a.customer_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to customer</Link>
      <PrintButton />
    </div>

    <Card>
      <CardHeader><CardTitle>Evidence report — agreement {a.agreement_code ?? a.id.slice(0, 8)}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p><span className="text-muted-foreground">Shop:</span> {a.shops?.name ?? "—"}{a.shops?.phone ? ` · ${a.shops.phone}` : ""}</p>
          <p><span className="text-muted-foreground">Customer:</span> {a.customers?.full_name ?? "—"}{a.customers?.national_id ? ` · NIC ${a.customers.national_id}` : ""}</p>
          <p><span className="text-muted-foreground">Phone:</span> {device ? `${device.brand ?? ""} ${device.model ?? ""}` : "—"}</p>
          <p><span className="text-muted-foreground">IMEI:</span> <span className="font-mono">{[device?.imei1, device?.imei2].filter(Boolean).join(" / ") || "—"}</span></p>
        </div>
        <div className="space-y-1">
          <p><span className="text-muted-foreground">Created:</span> {formatSL(a.created_at)}</p>
          <p><span className="text-muted-foreground">Price / deposit:</span> {formatCurrency(Number(a.total_price))} / {formatCurrency(Number(a.deposit))}</p>
          <p><span className="text-muted-foreground">Total / outstanding:</span> {formatCurrency(Number(a.total_repayment ?? 0))} / {formatCurrency(Number(a.outstanding_balance))}</p>
          <p><span className="text-muted-foreground">Status:</span> <span className="capitalize">{a.status}</span></p>
        </div>
        <div className="sm:col-span-2 rounded-lg border px-3 py-2">
          {rows.length === 0 ? <p className="text-muted-foreground">No recorded events yet for this agreement.</p>
            : broken === 0 ? <p className="flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-4 w-4" /> All {rows.length} entries verified: none has been changed since it was recorded.</p>
            : <p className="flex items-center gap-2 text-red-700"><ShieldX className="h-4 w-4" /> {broken} of {rows.length} entries FAILED verification — the record was changed after it was written.</p>}
          <p className="mt-1 text-xs text-muted-foreground">Report generated {formatSL(generated)}. Chain head: #{head?.seq ?? "—"} <span className="font-mono">{head?.hash ? `${String(head.hash).slice(0, 24)}…` : ""}</span>. Keep this printout: the head proves which entries existed when it was made.</p>
        </div>
      </CardContent>
    </Card>

    <Card><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground">
        <th className="p-2 font-medium">#</th><th className="p-2 font-medium">When</th><th className="p-2 font-medium">Event</th><th className="p-2 font-medium">By</th><th className="p-2 font-medium">Details</th><th className="p-2 font-medium">Hash</th><th className="p-2 font-medium">Check</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.seq} className="border-b last:border-0 align-top">
          <td className="p-2 font-mono">{r.seq}</td>
          <td className="p-2 whitespace-nowrap">{formatSL(r.occurred_at)}</td>
          <td className="p-2"><div className="font-medium">{r.event.replace(/_/g, " ")}</div><div className="text-muted-foreground">{r.source.replace(/_/g, " ")}</div></td>
          <td className="p-2">{r.actor_id ? actors[r.actor_id] ?? "staff" : "system / phone"}</td>
          <td className="p-2 max-w-sm break-all text-muted-foreground">{brief(r.details)}</td>
          <td className="p-2 font-mono text-muted-foreground" title={r.hash}>{r.hash.slice(0, 12)}…</td>
          <td className="p-2">{ok.get(r.seq) === false ? <Badge variant="danger">changed</Badge> : <Badge variant="success">ok</Badge>}</td>
        </tr>))}
      </tbody></table></div>
    </CardContent></Card>
  </>);
}
