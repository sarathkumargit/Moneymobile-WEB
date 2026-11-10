import "server-only";

// Tamper detection (anti-unlock plan, Phase 3).
//
// Signs that a financed phone is being reset, flashed or tampered with are recorded as alerts with points.
// A phone's score = points of its open alerts from the last 30 days (max 100). Staff review them on the
// Tamper Alerts page. If the shop switched on "auto-lock", a phone whose score reaches the shop's threshold
// is locked (agreement restriction_reason 'tamper') until staff unlock it.
//
// Everything here is best-effort: it never throws and never blocks a check-in. Until migration 0027 is run,
// nothing is recorded.

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
export type Enr = { id: string; shop_id: string; device_id: string | null; agreement_id?: string | null; customer_id?: string | null };

export type TamperRule =
  | "silent_48h" | "silent_7d"
  | "unsigned_checkin" | "bad_signature" | "replayed_checkin"
  | "key_lost" | "key_replaced" | "attestation_untrusted"
  | "bootloader_unlocked" | "boot_not_verified"
  | "adb_enabled" | "dev_options"
  | "reregistered" | "management_off";

export type Severity = "low" | "medium" | "high" | "critical";

export const TAMPER_RULES: Record<TamperRule, { label: string; severity: Severity; points: number; advice: string }> = {
  silent_48h:            { label: "No check-in for 2 days",                         severity: "medium",   points: 20, advice: "Call the customer. A phone that stays offline may be switched off, in another SIM-less phone, or being serviced." },
  silent_7d:             { label: "No check-in for 7 days",                         severity: "high",     points: 40, advice: "Contact the customer and the guarantor. Check the last location on the customer page." },
  unsigned_checkin:      { label: "Check-in without the phone's hardware signature", severity: "high",     points: 40, advice: "The app on this phone is not the one that was set up. It may have been reset or reinstalled." },
  bad_signature:         { label: "Check-in with a wrong hardware signature",       severity: "critical", points: 60, advice: "Someone may be imitating this phone. Check the phone in the shop." },
  replayed_checkin:      { label: "Old check-in sent again (replay)",               severity: "high",     points: 40, advice: "Someone may be replaying old messages to hide the phone's real state." },
  key_lost:              { label: "Phone says its hardware key is missing",          severity: "high",     points: 35, advice: "The phone's secure storage was wiped. This usually means a reset or a flash." },
  key_replaced:          { label: "Hardware key replaced",                          severity: "high",     points: 40, advice: "The phone registered a new key. Check the phone in the shop." },
  attestation_untrusted: { label: "Hardware check not confirmed by Google",          severity: "medium",   points: 20, advice: "The phone's key proof does not lead to Google. It may be a modified or uncertified phone." },
  bootloader_unlocked:   { label: "Bootloader unlocked",                             severity: "critical", points: 60, advice: "The phone can now be flashed freely. Bring it back to the shop." },
  boot_not_verified:     { label: "Firmware not verified",                           severity: "high",     points: 40, advice: "The phone is running firmware that is not the maker's original." },
  adb_enabled:           { label: "USB debugging is on",                             severity: "medium",   points: 15, advice: "USB debugging is how most PC tools reach a phone. Ask why it was turned on." },
  dev_options:           { label: "Developer options are on",                        severity: "low",      points: 10, advice: "Usually the first step before USB debugging or OEM unlock." },
  reregistered:          { label: "Phone registered again (it was wiped)",           severity: "high",     points: 50, advice: "The app was set up again without a Release. The phone was probably reset or flashed." },
  management_off:        { label: "App is no longer managing the phone",             severity: "high",     points: 40, advice: "MoneyMobile lost Device Owner. The phone was probably reset." },
};

export const SEVERITY_BADGE: Record<Severity, "neutral" | "warning" | "danger"> = { low: "neutral", medium: "warning", high: "danger", critical: "danger" };
const SCORE_WINDOW_DAYS = 30;

const missing = (msg?: string) => !!msg && /device_tamper_events|tamper_|does not exist|schema cache/i.test(msg);

/**
 * Records (or bumps) an open alert for this phone + rule, then rescores the phone and applies the shop's
 * auto-lock rule. Returns the alert id, or null if nothing could be recorded.
 */
export async function recordTamper(admin: Admin, enr: Enr, rule: TamperRule, details: Record<string, unknown> = {}): Promise<string | null> {
  const meta = TAMPER_RULES[rule];
  const dedupe = `${enr.id}:${rule}`;
  const now = new Date().toISOString();
  try {
    const { data: open, error: selErr } = await admin.from("device_tamper_events").select("id,occurrences")
      .eq("dedupe_key", dedupe).in("status", ["open", "acknowledged"]).limit(1).maybeSingle();
    if (selErr) { if (!missing(selErr.message)) console.warn("[tamper] lookup:", selErr.message); return null; }
    let id: string | null = null;
    if (open) {
      id = open.id as string;
      await admin.from("device_tamper_events").update({ occurrences: Number(open.occurrences || 1) + 1, last_seen_at: now, details }).eq("id", id);
    } else {
      const { data: ins, error } = await admin.from("device_tamper_events").insert({
        shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id, agreement_id: enr.agreement_id ?? null,
        rule, severity: meta.severity, points: meta.points, details, dedupe_key: dedupe,
      }).select("id").single();
      if (error) { if (!/duplicate key/i.test(error.message)) console.warn("[tamper] insert:", error.message); return null; }
      id = (ins?.id as string) ?? null;
      await admin.from("audit_logs").insert({ shop_id: enr.shop_id, actor_id: null, action: `tamper_${rule}`, entity: "device_enrollments", entity_id: enr.id, details: { rule, severity: meta.severity, points: meta.points, ...details } });
    }
    await rescoreAndAct(admin, enr, id);
    return id;
  } catch (e) {
    console.warn("[tamper] skipped:", (e as Error).message);
    return null;
  }
}

/** Sum of open alert points (last 30 days, max 100) → device_enrollments.tamper_score. */
export async function rescore(admin: Admin, enrollmentId: string): Promise<number> {
  const since = new Date(Date.now() - SCORE_WINDOW_DAYS * 86400000).toISOString();
  const { data } = await admin.from("device_tamper_events").select("points")
    .eq("enrollment_id", enrollmentId).in("status", ["open", "acknowledged"]).gte("last_seen_at", since);
  const score = Math.min(100, (data ?? []).reduce((s: number, r: { points: number | null }) => s + Number(r.points || 0), 0));
  await admin.from("device_enrollments").update({ tamper_score: score, tamper_scored_at: new Date().toISOString() }).eq("id", enrollmentId);
  return score;
}

async function rescoreAndAct(admin: Admin, enr: Enr, eventId: string | null) {
  const score = await rescore(admin, enr.id);
  const { data: shop } = await admin.from("shops").select("tamper_auto_lock,tamper_lock_threshold").eq("id", enr.shop_id).maybeSingle();
  if (!shop?.tamper_auto_lock || score < Number(shop.tamper_lock_threshold ?? 60)) return;
  const agreementId = enr.agreement_id ?? null;
  if (!agreementId) return;
  const { data: a } = await admin.from("installment_agreements").select("id,status,restriction,outstanding_balance").eq("id", agreementId).maybeSingle();
  if (!a || a.status !== "active" || Number(a.outstanding_balance || 0) <= 0 || a.restriction === "restricted") return;
  // 'tamper' keeps it apart from overdue (a payment never lifts it; staff must unlock). Older databases may
  // only accept the original reasons — then fall back to 'manual', which behaves the same way.
  let { error } = await admin.from("installment_agreements").update({ restriction: "restricted", restriction_reason: "tamper" }).eq("id", agreementId);
  if (error) ({ error } = await admin.from("installment_agreements").update({ restriction: "restricted", restriction_reason: "manual" }).eq("id", agreementId));
  if (error) { console.warn("[tamper] auto-lock failed:", error.message); return; }
  if (eventId) await admin.from("device_tamper_events").update({ action_taken: "auto_locked" }).eq("id", eventId);
  await admin.from("audit_logs").insert({ shop_id: enr.shop_id, actor_id: null, action: "tamper_auto_lock", entity: "installment_agreements", entity_id: agreementId, details: { score, threshold: shop.tamper_lock_threshold, enrollment_id: enr.id } });
}

/**
 * Silence check for the shop's phones (no check-in for 48 h / 7 days while money is owed).
 * Cheap: run when staff open Tamper Alerts and from the daily cron.
 */
export async function scanSilentPhones(admin: Admin, shopId: string | null): Promise<number> {
  try {
    const cutoff48 = new Date(Date.now() - 48 * 3600000).toISOString();
    let q = admin.from("device_enrollments").select("id,shop_id,device_id,agreement_id,last_sync,status").eq("status", "enrolled").lt("last_sync", cutoff48).limit(500);
    if (shopId) q = q.eq("shop_id", shopId);
    const { data: enrs, error } = await q;
    if (error || !enrs?.length) return 0;
    const agrIds = Array.from(new Set(enrs.map((e: { agreement_id: string | null }) => e.agreement_id).filter((x): x is string => !!x)));
    if (!agrIds.length) return 0;
    const { data: agrs } = await admin.from("installment_agreements").select("id,status,outstanding_balance").in("id", agrIds);
    const live = new Set((agrs ?? []).filter((a: { status: string; outstanding_balance: number | null }) => a.status === "active" && Number(a.outstanding_balance || 0) > 0).map((a: { id: string }) => a.id));
    let n = 0;
    for (const e of enrs as Array<{ id: string; shop_id: string; device_id: string | null; agreement_id: string | null; last_sync: string }>) {
      if (!e.agreement_id || !live.has(e.agreement_id)) continue;
      const days = (Date.now() - new Date(e.last_sync).getTime()) / 86400000;
      const rule: TamperRule = days >= 7 ? "silent_7d" : "silent_48h";
      if (await recordTamper(admin, e, rule, { last_sync: e.last_sync, days: Math.floor(days) })) n++;
    }
    return n;
  } catch (e) {
    console.warn("[tamper] silence scan skipped:", (e as Error).message);
    return 0;
  }
}

/** When a phone checks in again, its "silent" alerts resolve themselves. */
export async function clearSilence(admin: Admin, enrollmentId: string) {
  try {
    const { data } = await admin.from("device_tamper_events").update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_note: "Phone checked in again" })
      .eq("enrollment_id", enrollmentId).in("rule", ["silent_48h", "silent_7d"]).in("status", ["open", "acknowledged"]).select("id");
    if (data?.length) await rescore(admin, enrollmentId);
  } catch { /* 0027 not run */ }
}

/**
 * The notice the phone shows the customer (app 1.11.0+) while a high/critical alert is open.
 * Same id until a new alert opens, so the phone shows it once.
 */
export async function tamperNotice(admin: Admin, enrollmentId: string, shopName: string, shopPhone: string) {
  try {
    const { data } = await admin.from("device_tamper_events").select("id,severity,created_at")
      .eq("enrollment_id", enrollmentId).eq("status", "open").in("severity", ["high", "critical"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      title: "Security check",
      text: `This phone is under an installment agreement with ${shopName || "the shop"}. A change to the phone was detected and reported to the shop.${shopPhone ? ` Please call ${shopPhone}.` : ""}`,
    };
  } catch { return null; }
}
