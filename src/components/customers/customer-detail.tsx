import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, FileText, HardDrive, ShieldAlert, Smartphone, ChevronDown, Radar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/auth";
import { signedDocUrl } from "@/lib/shared/storage";
import { CustomerManage } from "@/components/customers/customer-manage";
import { AgreementCalculatorForm } from "@/components/billing/agreement-calculator-form";
import { NewPaymentForm } from "@/components/billing/new-payment-form";
import { UnlockCodeButton } from "@/components/unlocks/unlock-code-button";
import { EnrollTokenButton } from "@/components/devices/enroll-token-button";
import { resolveSecurityEvent, sendTestPush } from "@/app/shop/device-management/actions";
import { DeviceAdminButtons } from "@/components/devices/device-admin-buttons";
import { DueDateEditor } from "@/components/billing/due-date-editor";
import { formatSL, formatSLDate, slToUtcIso } from "@/lib/shared/srilanka-time";
import { DeviceCommandPanel, type CommandRow } from "@/components/devices/device-command-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/shared/utils";
import { rowDisplayStatus } from "@/lib/billing/schedule";

const sBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { active: "success", completed: "neutral", defaulted: "danger", released: "neutral", cancelled: "neutral", draft: "warning" };
// The app checks in every ~60s while its service runs, so 5 min without a sync means it is not reachable right now.
function online(last: string | null) { return last ? Date.now() - new Date(last).getTime() < 5 * 60 * 1000 : false; }
// "12 min", "3 h 5 min", "2 days 4 h" — how long since the phone last checked in.
function sinceLabel(last: string | null) {
  if (!last) return "never connected";
  const m = Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? `${d} day${d > 1 ? "s" : ""}${h % 24 ? ` ${h % 24} h` : ""}` : `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
// Offline for more than a day is worth a follow-up call; shown in red.
function offlineVariant(last: string | null): "warning" | "danger" {
  return !last || Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000 ? "danger" : "warning";
}

const ENR_COLS = "id,status,model,imei1,last_sync,device_id,agreement_id";

// Loads enrollments for this customer's phones. Matches on device_id as well as customer_id,
// because an enrollment created before the phone was assigned has customer_id = null.
// If migration 0005 has not been run, selecting management_active makes PostgREST reject the
// whole query (data = null), which is what made every phone show "not connected" — so retry
// without that column.
async function loadEnrollments(supabase: ReturnType<typeof createClient>, customerId: string, deviceIds: string[]) {
  const filter = deviceIds.length ? `customer_id.eq.${customerId},device_id.in.(${deviceIds.join(",")})` : `customer_id.eq.${customerId}`;
  const withMgmt = await supabase.from("device_enrollments").select(`${ENR_COLS},management_active`).or(filter).order("created_at", { ascending: false });
  if (!withMgmt.error) return { rows: (withMgmt.data ?? []) as EnrRow[], managementKnown: true };
  console.warn("[customer-detail] enrollment query failed, retrying without management_active (run migration 0005_management_status.sql):", withMgmt.error.message);
  const plain = await supabase.from("device_enrollments").select(ENR_COLS).or(filter).order("created_at", { ascending: false });
  if (plain.error) console.error("[customer-detail] enrollment query failed:", plain.error.message);
  return { rows: ((plain.data ?? []) as Omit<EnrRow, "management_active">[]).map((r) => ({ ...r, management_active: null })), managementKnown: false };
}

type EnrRow = { id: string; status: string; model: string | null; imei1: string | null; last_sync: string | null; device_id: string | null; agreement_id: string | null; management_active: boolean | null };
type DevRow = { id: string; brand: string | null; model: string | null; imei1: string | null; status: string };

const AGR_COLS = "id,agreement_code,device_id,total_price,installment_amount,total_repayment,outstanding_balance,installment_months,status,grace_days,restriction,first_due_date";
// restriction_reason arrives with migration 0014. Select it when present; fall back without it so
// the customer page never breaks on a database that hasn't run 0014 yet.
async function loadAgreements(supabase: ReturnType<typeof createClient>, customerId: string) {
  const withReason = await supabase.from("installment_agreements").select(`${AGR_COLS},restriction_reason`).eq("customer_id", customerId).order("created_at", { ascending: false });
  if (!withReason.error) return withReason;
  return supabase.from("installment_agreements").select(AGR_COLS).eq("customer_id", customerId).order("created_at", { ascending: false });
}

const SCHED_SEL = "id,agreement_id,seq,due_date,amount,paid,status";
// Schedule rows for a set of agreements. due_at arrives with migration 0015; fall back without it.
async function loadSchedules(supabase: ReturnType<typeof createClient>, agrIds: string[]) {
  if (!agrIds.length) return [] as Array<{ id: string; agreement_id: string; seq: number; due_date: string; due_at?: string | null; amount: number; paid: number; status: string }>;
  const withAt = await supabase.from("installment_schedules").select(`${SCHED_SEL},due_at`).in("agreement_id", agrIds).order("seq", { ascending: true });
  const data = withAt.error
    ? (await supabase.from("installment_schedules").select(SCHED_SEL).in("agreement_id", agrIds).order("seq", { ascending: true })).data
    : withAt.data;
  return (data ?? []) as Array<{ id: string; agreement_id: string; seq: number; due_date: string; due_at?: string | null; amount: number; paid: number; status: string }>;
}

export async function CustomerDetail({ id, backHref }: { id: string; backHref: string }) {
  const supabase = createClient();
  const session = await getSessionProfile();
  const canManage = session?.profile.role === "shop_admin";
  // Resale / delete: shop admins and employees (the people who hand phones over).
  const canOperateDevices = session?.profile.role === "shop_admin" || session?.profile.role === "employee";
  const canOperate = session?.profile.role === "shop_admin" || session?.profile.role === "employee";
  // One parallel batch for everything that only needs the customer id — the customer lookup
  // included — so the notFound check costs no extra sequential round-trip.
  const [{ data: customer }, { data: agreements }, { data: payments }, { data: custDevices }, { data: allDevices }, { data: guarantors }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    loadAgreements(supabase, id),
    supabase.from("payment_transactions").select("id,amount,method,paid_at,verification").eq("customer_id", id).order("paid_at", { ascending: false }),
    supabase.from("devices").select("id,brand,model,imei1,status").eq("customer_id", id),
    supabase.from("devices").select("id,brand,model,imei1").order("created_at", { ascending: false }),
    supabase.from("guarantors").select("id,full_name,national_id,phone,email,address,relationship,nic_doc_url,nic_doc_back_url").eq("customer_id", id).order("created_at", { ascending: false }),
  ]);
  if (!customer) notFound();

  type Guar = { id: string; full_name: string; national_id: string | null; phone: string | null; email: string | null; address: string | null; relationship: string | null; nic_doc_url: string | null; nic_doc_back_url: string | null };
  const guars = (guarantors ?? []) as Guar[];
  const devs = (custDevices ?? []) as DevRow[];
  // A phone named on one of this customer's agreements always counts as theirs, even if the phone row
  // itself was never tied to the customer (older agreements, or a link that failed).
  const haveIds = new Set(devs.map((d) => d.id));
  const missingIds = Array.from(new Set((agreements ?? []).map((a) => (a as { device_id: string | null }).device_id).filter((x): x is string => !!x && !haveIds.has(x))));
  if (missingIds.length) {
    const { data: extra } = await supabase.from("devices").select("id,brand,model,imei1,status").in("id", missingIds);
    devs.push(...((extra ?? []) as DevRow[]));
  }
  const agrIds = (agreements ?? []).map((a) => (a as { id: string }).id);
  // Photos, enrollments and the installment schedule all depend only on the first batch, so they
  // load together in one round-trip instead of three sequential ones.
  const [custNicUrl, custNicBackUrl, guarNicUrls, guarNicBackUrls, { rows: enr, managementKnown }, schedRows] = await Promise.all([
    signedDocUrl(customer.nic_doc_url),
    signedDocUrl(customer.nic_doc_back_url),
    Promise.all(guars.map((g) => signedDocUrl(g.nic_doc_url))),
    Promise.all(guars.map((g) => signedDocUrl(g.nic_doc_back_url))),
    loadEnrollments(supabase, id, devs.map((d) => d.id)),
    loadSchedules(supabase, agrIds),
  ]);
  const Doc = ({ url, label }: { url: string | null; label: string }) => url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <img src={url} alt={label} loading="lazy" decoding="async" className="max-h-44 rounded-lg border object-contain" />
    </a>
  ) : null;

  const enrByDevice: Record<string, EnrRow> = {};
  // rows are newest-first: keep the first (newest) enrollment per phone
  enr.forEach((e) => { if (e.device_id && !enrByDevice[e.device_id]) enrByDevice[e.device_id] = e; });
  const enrIds = enr.map((e) => e.id);
  // Events, commands and last-known locations all depend only on enrIds — one parallel batch
  // (the location lookup used to be a separate, later round-trip).
  const [{ data: events }, { data: commands }, { data: locs }, { data: sims }] = enrIds.length
    ? await Promise.all([
        supabase.from("device_security_events").select("id,event_type,details,status,created_at").in("enrollment_id", enrIds).order("created_at", { ascending: false }).limit(10),
        supabase.from("device_commands").select("id,enrollment_id,device_id,command,status,created_at,sent_at,acked_at,result").in("enrollment_id", enrIds).order("created_at", { ascending: false }).limit(30),
        // best-effort; errors (data = null) until migration 0011 is run
        supabase.from("device_enrollments").select("id,device_id,last_lat,last_lng,location_accuracy,location_at").in("id", enrIds),
        // best-effort; errors (data = null) until migration 0013 is run
        supabase.from("device_enrollments").select("id,sim_state,sim_state_at,sim_operator,app_version").in("id", enrIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const simByEnr: Record<string, { sim_state: string | null; sim_operator: string | null; app_version: string | null }> = {};
  const simMigrated = sims !== null;
  let simRows = sims;
  if (!simMigrated && enrIds.length) {
    // Migration 0013 not run yet: still show operator + app version from the older columns.
    const { data: basic } = await supabase.from("device_enrollments").select("id,sim_operator,app_version").in("id", enrIds);
    simRows = ((basic ?? []) as Array<{ id: string; sim_operator: string | null; app_version: string | null }>).map((r) => ({ ...r, sim_state: null, sim_state_at: null }));
  }
  ((simRows ?? []) as Array<{ id: string; sim_state: string | null; sim_operator: string | null; app_version: string | null }>).forEach((r) => { simByEnr[r.id] = r; });
  const enrDevice: Record<string, string | null> = {};
  enr.forEach((e) => { enrDevice[e.id] = e.device_id; });
  const cmdsByDevice: Record<string, CommandRow[]> = {};
  ((commands ?? []) as Array<CommandRow & { enrollment_id: string; device_id: string | null }>).forEach((c) => {
    const dev = c.device_id ?? enrDevice[c.enrollment_id];
    if (!dev) return;
    (cmdsByDevice[dev] ??= []);
    if (cmdsByDevice[dev].length < 3) cmdsByDevice[dev].push(c);
  });
  const evts = (events ?? []) as Array<{ id: string; event_type: string | null; details: string | null; status: string; created_at: string }>;

  // Last-known location per device (best-effort; stays empty until migration 0011 is run).
  const locByDevice: Record<string, { lat: number; lng: number; acc: number | null; at: string | null }> = {};
  {
    ((locs ?? []) as Array<{ device_id: string | null; last_lat: number | null; last_lng: number | null; location_accuracy: number | null; location_at: string | null }>).forEach((l) => {
      if (l.device_id && l.last_lat != null && l.last_lng != null) locByDevice[l.device_id] = { lat: l.last_lat, lng: l.last_lng, acc: l.location_accuracy, at: l.location_at };
    });
  }

  const agr = (agreements ?? []) as Array<{ id: string; agreement_code: string | null; device_id: string | null; total_price: number; installment_amount: number; total_repayment: number | null; outstanding_balance: number; installment_months: number | null; status: string; grace_days: number | null; restriction: string | null; restriction_reason?: string | null; first_due_date: string | null }>;
  // Group the schedule rows (already loaded above) by agreement for the table.
  const schedByAgr: Record<string, Array<{ id: string; seq: number; due_date: string; due_at?: string | null; amount: number; paid: number; status: string }>> = {};
  ((schedRows ?? []) as Array<{ id: string; agreement_id: string; seq: number; due_date: string; due_at?: string | null; amount: number; paid: number; status: string }>).forEach((r) => { (schedByAgr[r.agreement_id] ??= []).push(r); });
  const pays = (payments ?? []) as Array<{ id: string; amount: number; method: string; paid_at: string; verification: string }>;
  const totalDue = agr.filter((a) => a.status === "active").reduce((s, a) => s + Number(a.outstanding_balance || 0), 0);
  // Balance still owed on a specific phone (falls back to the customer's total if no agreement names the phone).
  const owingFor = (deviceId: string) => {
    const mine = agr.filter((a) => a.device_id === deviceId);
    const live = (mine.length ? mine : agr).filter((a) => !["cancelled", "released"].includes(a.status));
    return live.reduce((s, a) => s + Math.max(0, Number(a.outstanding_balance || 0)), 0);
  };
  const deviceOpts = (allDevices ?? []).map((d: { id: string; brand: string | null; model: string | null; imei1: string | null }) => ({ id: d.id, label: `${d.brand ?? ""} ${d.model ?? ""}${d.imei1 ? ` · ${d.imei1}` : ""}` }));
  const payAgrOpts = agr.filter((a) => a.status === "active").map((a) => ({ id: a.id, label: `${a.agreement_code ?? ""} · bal ${Number(a.outstanding_balance).toLocaleString()}` }));
  const primaryAgreementId = agr.find((a) => a.status === "active")?.id ?? agr[0]?.id ?? null;

  return (<>
    <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>

    <Card><CardContent className="p-6"><div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold">{customer.full_name}</h2>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {customer.national_id && <p>NIC: <span className="font-mono">{customer.national_id}</span></p>}
          {customer.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</p>}
          {customer.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</p>}
          {customer.address && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{customer.address}</p>}
        </div>
      </div>
      <div className="rounded-xl bg-primary/10 px-5 py-3 text-right"><p className="text-xs text-muted-foreground">Total due</p><p className="text-2xl font-bold text-primary">{formatCurrency(totalDue)}</p></div>
    </div></CardContent></Card>

    {canManage && <CustomerManage customer={{ id: customer.id, full_name: customer.full_name, national_id: customer.national_id, phone: customer.phone, email: customer.email, address: customer.address }} />}

    {(custNicUrl || guars.length > 0) && (
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> ID documents &amp; guarantor</CardTitle></CardHeader><CardContent className="space-y-5">
        {(custNicUrl || custNicBackUrl) && (
          <div>
            <p className="mb-2 text-sm font-medium">Customer ID card</p>
            <div className="flex flex-wrap gap-4"><Doc url={custNicUrl} label="Front" /><Doc url={custNicBackUrl} label="Back" /></div>
          </div>
        )}
        {guars.map((g, i) => (
          <div key={g.id} className="rounded-lg border p-4">
            <p className="font-medium">{g.full_name} {g.relationship && <span className="text-xs text-muted-foreground">· {g.relationship}</span>}</p>
            <div className="mt-1 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
              {g.national_id && <p>NIC: <span className="font-mono">{g.national_id}</span></p>}
              {g.phone && <p>Phone: {g.phone}</p>}
              {g.email && <p>Email: {g.email}</p>}
              {g.address && <p>Address: {g.address}</p>}
            </div>
            {(guarNicUrls[i] || guarNicBackUrls[i]) && <div className="mt-3 flex flex-wrap gap-4"><Doc url={guarNicUrls[i]} label="Front" /><Doc url={guarNicBackUrls[i]} label="Back" /></div>}
          </div>
        ))}
      </CardContent></Card>
    )}

    {/* Device control — always visible per assigned phone */}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Device control</CardTitle></CardHeader><CardContent className="space-y-4">
      {devs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Assign a phone to this customer first (below), then you can lock/unlock it here.</p>
      ) : devs.map((d) => {
        const e = enrByDevice[d.id];
        // "connected" = the app has enrolled and checked in at least once. Re-issuing an enrollment
        // token flips status back to "pending", but the phone keeps its device token and keeps syncing.
        const released = e?.status === "released";
        const connected = !!e && !released && e.status !== "revoked" && (e.status === "enrolled" || !!e.last_sync);
        const detailBody = (
          <>
            <DeviceCommandPanel deviceId={d.id} customerId={customer.id} commands={cmdsByDevice[d.id] ?? []} owing={owingFor(d.id)} released={released}>
              <EnrollTokenButton deviceId={d.id} agreementId={primaryAgreementId} />
              <UnlockCodeButton deviceId={d.id} />
              <form action={sendTestPush}>
                <input type="hidden" name="device_id" value={d.id} />
                <input type="hidden" name="customer_id" value={customer.id} />
                <Button type="submit" size="sm" variant="outline"><Radar className="h-3.5 w-3.5" /> Check if online</Button>
              </form>
            </DeviceCommandPanel>
            {connected && !managementKnown && (
              <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Device Owner status unknown — run <code>supabase/migrations/0005_management_status.sql</code> in the Supabase SQL editor to show it here.
              </p>
            )}
            {connected && managementKnown && e!.management_active === false && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                ⚠ Management not active (not Device Owner). Lock shows a screen but the phone can still be closed, uninstalled, or factory-reset. Provision as Device Owner via ADB to enforce kiosk, uninstall-block and reset-protection.
              </p>
            )}
            {locByDevice[d.id] && <DeviceLocation loc={locByDevice[d.id]} />}
            {!connected && !released && <p className="mt-2 text-xs text-muted-foreground">Phone not connected yet — these actions queue and apply once it&apos;s enrolled and online (Wi-Fi is enough; no mobile data needed).</p>}
          </>
        );
        return (
          <div key={d.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{d.brand} {d.model} <span className="font-mono text-xs text-muted-foreground">{d.imei1 ?? ""}</span></p>
                <p className="text-xs text-muted-foreground">{e ? (e.last_sync ? `Last sync: ${formatSL(e.last_sync)}` : e.status === "pending" ? "Enrollment token issued — waiting for the app to enroll" : "Enrolled, awaiting first sync") : "Not connected yet"}</p>
                {e && connected && (() => {
                  const sim = simByEnr[e.id];
                  return (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {sim?.sim_state === "absent" ? <Badge variant="danger">SIM removed</Badge>
                        : sim?.sim_state === "present" ? <span>SIM: present{sim.sim_operator ? ` · ${sim.sim_operator}` : ""}</span>
                        : <span>SIM: unknown{simMigrated ? "" : " — run migration 0013_sim_state.sql in Supabase"}</span>}
                      {sim?.app_version && <span>· App v{sim.app_version}</span>}
                    </p>
                  );
                })()}
              </div>
              {released ? <Badge variant="neutral">released</Badge>
                : connected ? (online(e!.last_sync)
                    ? <Badge variant="success" title={`Last check-in ${formatSL(e!.last_sync)}`}>● Active</Badge>
                    : <Badge variant={offlineVariant(e!.last_sync)} title={e!.last_sync ? `Last seen ${formatSL(e!.last_sync)}` : undefined}>Offline · {sinceLabel(e!.last_sync)}</Badge>)
                : e ? <Badge variant="warning" className="capitalize">{e.status === "pending" ? "awaiting enrollment" : e.status}</Badge>
                : <Badge variant="neutral">not connected</Badge>}
            </div>
            {released ? (
              <details className="group mt-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  Show device details
                </summary>
                <div className="mt-2">{detailBody}</div>
              </details>
            ) : detailBody}
            {/* Always visible (also for released phones, whose details are collapsed). */}
            {canOperateDevices && (
              <div className="mt-3 space-y-1 border-t pt-3">
                {released && <p className="text-xs text-muted-foreground">Released to the customer — Lock, Unlock and unlock codes no longer apply to this phone.</p>}
                <DeviceAdminButtons deviceId={d.id} customerId={customer.id} label={`${d.brand ?? ""} ${d.model ?? "phone"}`.trim()} />
                <p className="text-xs text-muted-foreground"><b>Reset for resale</b>: selling it again — unlinks it from this customer (factory reset the phone, then run setup). <b>Delete phone</b>: remove it from MoneyMobile completely.</p>
              </div>
            )}
          </div>
        );
      })}

      {evts.length > 0 && (
        <details open={evts.some((e) => e.status === "approval_required")} className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 hover:bg-muted/50">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" /> SIM-change &amp; security events <span className="text-xs font-normal text-muted-foreground">({evts.length})</span>{evts.some((e) => e.status === "approval_required") && <Badge variant="danger">{evts.filter((e) => e.status === "approval_required").length} need review</Badge>}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
          {evts.map((ev) => (
            <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 first:border-0 text-sm">
              <div><span className="font-medium capitalize">{(ev.event_type ?? "event").replace(/_/g, " ")}</span><span className="ml-2 text-xs text-muted-foreground">{ev.details ?? ""} · {formatSL(ev.created_at)}</span></div>
              {ev.status === "approval_required" ? (
                <div className="flex gap-2">
                  <form action={resolveSecurityEvent}><input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="decision" value="approved" /><Button type="submit" size="sm" variant="outline">Approve &amp; unlock</Button></form>
                  <form action={resolveSecurityEvent}><input type="hidden" name="event_id" value={ev.id} /><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="decision" value="rejected" /><Button type="submit" size="sm" variant="destructive">Reject (keep locked)</Button></form>
                </div>
              ) : <Badge variant={ev.status === "approved" ? "success" : ev.status === "rejected" ? "danger" : "neutral"} className="capitalize">{ev.status}</Badge>}
            </div>
          ))}
          </div>
        </details>
      )}
    </CardContent></Card>

    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assign phone &amp; create installment</h3>
      <AgreementCalculatorForm devices={deviceOpts} fixedCustomer={{ id: customer.id, full_name: customer.full_name }} />
    </div>

    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Record a payment</h3>
      {payAgrOpts.length === 0 ? <p className="text-sm text-muted-foreground">No active agreement yet — create one above first.</p> : <NewPaymentForm agreements={payAgrOpts} />}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Installment agreements &amp; payment schedule</CardTitle></CardHeader><CardContent className="space-y-6">
        {agr.length === 0 ? <p className="text-sm text-muted-foreground">No agreements yet.</p> : agr.map((a) => {
          const rows = schedByAgr[a.id] ?? [];
          const grace = a.grace_days ?? 0;
          const paidCount = rows.filter((r) => r.status === "paid").length;
          const overdueCount = rows.filter((r) => rowDisplayStatus(r, grace) === "overdue").length;
          return (
            <details key={a.id} open={a.status === "active"} className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-3 hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{a.agreement_code ?? "—"}</p>
                    <p className="text-sm">{formatCurrency(Number(a.installment_amount))} / month · {a.installment_months ?? 0} months{grace ? ` · ${grace}-day grace` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Paid {paidCount}/{rows.length || a.installment_months || 0}</span>
                  {overdueCount > 0 && <Badge variant="danger">{overdueCount} overdue</Badge>}
                  <span className="font-semibold">{formatCurrency(Number(a.outstanding_balance))} left</span>
                  <Badge variant={sBadge[a.status] ?? "neutral"} className="capitalize">{a.status}</Badge>
                </div>
              </summary>
              {a.restriction === "restricted" && a.restriction_reason === "overdue" && (
                <p className="border-b bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">🔒 Phone locked for an overdue payment. Recording the overdue amount unlocks it automatically on the next check-in.</p>
              )}
              {rows.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No schedule rows. (Agreements created before the schedule feature won&apos;t have them.)</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">#</th><th className="p-3 font-medium">Due date</th><th className="p-3 font-medium text-right">Amount</th><th className="p-3 font-medium text-right">Paid</th><th className="p-3 font-medium">Status</th></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const st = rowDisplayStatus(r, grace);
                        const meta = {
                          paid: { v: "success" as const, label: "Paid" },
                          partial: { v: "warning" as const, label: "Partial" },
                          overdue: { v: "danger" as const, label: "Overdue" },
                          due: { v: "warning" as const, label: "Due soon" },
                          upcoming: { v: "neutral" as const, label: "Upcoming" },
                        }[st];
                        return (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="p-3 text-muted-foreground">{r.seq}</td>
                            <td className="p-3">{canOperate
                              ? <DueDateEditor scheduleId={r.id} customerId={customer.id} dueAtIso={r.due_at ?? null} dueDate={r.due_date} />
                              : formatSL(r.due_at ?? slToUtcIso(r.due_date))}</td>
                            <td className="p-3 text-right">{formatCurrency(Number(r.amount))}</td>
                            <td className="p-3 text-right text-muted-foreground">{Number(r.paid) > 0 ? formatCurrency(Number(r.paid)) : "—"}</td>
                            <td className="p-3"><Badge variant={meta.v}>{meta.label}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          );
        })}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Payment history</CardTitle></CardHeader><CardContent className="p-0">
        {pays.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No payments recorded yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Date</th><th className="p-3 font-medium">Method</th><th className="p-3 font-medium text-right">Amount</th><th className="p-3 font-medium">Status</th></tr></thead><tbody>
          {pays.map((p) => (<tr key={p.id} className="border-b last:border-0"><td className="p-3 text-muted-foreground">{formatSLDate(p.paid_at)}</td><td className="p-3 capitalize text-muted-foreground">{p.method.replace(/_/g, " ")}</td><td className="p-3 text-right font-semibold">{formatCurrency(Number(p.amount))}</td><td className="p-3"><Badge variant="success" className="capitalize">{p.verification}</Badge></td></tr>))}
        </tbody></table></div>)}
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Assigned phones</CardTitle></CardHeader><CardContent className="p-0">
      {devs.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No phone assigned yet.</p> : (
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Device</th><th className="p-3 font-medium">IMEI</th><th className="p-3 font-medium">Status</th></tr></thead><tbody>
        {devs.map((d) => (<tr key={d.id} className="border-b last:border-0"><td className="p-3 font-medium">{d.brand} {d.model}</td><td className="p-3 font-mono text-xs text-muted-foreground">{d.imei1 ?? "—"}</td><td className="p-3"><Badge variant="neutral" className="capitalize">{d.status.replace(/_/g, " ")}</Badge></td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}

function DeviceLocation({ loc }: { loc: { lat: number; lng: number; acc: number | null; at: string | null } }) {
  const { lat, lng, acc, at } = loc;
  const d = 0.008;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium"><MapPin className="h-3.5 w-3.5" /> Last known location</span>
        <span className="text-muted-foreground">{at ? `Updated ${formatSL(at)}` : ""}{acc ? ` · ±${acc}m` : ""}</span>
      </div>
      <iframe title="Device location" src={src} className="h-56 w-full rounded-md border" loading="lazy" />
      <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">Open in OpenStreetMap →</a>
    </div>
  );
}
