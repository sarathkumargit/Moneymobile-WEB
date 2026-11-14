export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, resolveAgreementId } from "@/lib/devices/device-api";
import { raiseSimAlert } from "@/lib/devices/sim-alert";
import { OFFLINE_UNLOCK_GRACE_MINUTES } from "@/lib/devices/offline-unlock";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ success: false, error: "bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,shop_id,device_id,customer_id,agreement_id,device_token_hash").eq("id", b.device_id).maybeSingle();
  if (!enr || enr.device_token_hash !== sha256(b.device_token || "")) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  const type = String(b.event_type ?? "unknown");
  // Released on the phone with a shop "offline release code" (app 1.11.4+). The phone has already
  // removed all protection and Device Owner; record it like a normal release.
  if (type === "OFFLINE_RELEASE_CODE") {
    await recordOfflineRelease(admin, enr, b.details ?? null, typeof b.timestamp === "number" && typeof b.sent_at === "number" ? b.timestamp + (Date.now() - b.sent_at) : null);
    return Response.json({ success: true, data: null, message: "recorded" });
  }
  const isSim = type.toLowerCase().includes("sim");
  // When did the phone actually see this? It may be reporting hours later (it was offline).
  // Correct for a wrong phone clock using the gap between its send time and ours.
  const detectedAtMs = typeof b.timestamp === "number" && typeof b.sent_at === "number"
    ? b.timestamp + (Date.now() - b.sent_at) : null;
  // Did staff already unlock this phone AFTER that moment (Unlock button / unlock code / approval
  // while the phone was offline)? Then this old alert must not lock it again.
  let unlockedSince = false;
  if (isSim && detectedAtMs !== null) {
    const since = new Date(detectedAtMs).toISOString();
    const [{ data: laterCmd }, { data: laterKey }] = await Promise.all([
      admin.from("device_commands").select("id")
        .eq("enrollment_id", enr.id).in("command", ["UNLOCK_DEVICE", "RELEASE_DEVICE"])
        .gt("created_at", since).limit(1).maybeSingle(),
      // An offline unlock code issued after the SIM was pulled is also staff deciding to unlock,
      // so a late SIM alert must not re-lock the phone. (Codes no longer queue an UNLOCK command.)
      // A phone with no device record (not linked yet) can't have a code: skip instead of querying "= null".
      enr.device_id
        ? admin.from("temporary_unlock_keys").select("id")
            .eq("device_id", enr.device_id).gt("created_at", since).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    unlockedSince = !!laterCmd || !!laterKey;
  }
  if (isSim && !unlockedSince) {
    // SIM removed/changed: one open alert per phone + locked server-side until staff decide.
    await raiseSimAlert(admin, enr, type, b.details ?? null);
  } else if (isSim) {
    await admin.from("device_security_events").insert({
      shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id,
      event_type: type, details: `${b.details ?? ""} — reported late; staff had already unlocked the phone, so it was not locked again`.trim(),
      status: "resolved",
    });
  } else {
    // Unlock code: the phone is open for 30 minutes counted from when the customer TYPED the code
    // (detectedAtMs), not from when it was reported — a phone that was offline reports late, and
    // must not get a fresh 30 minutes for an old unlock.
    const isCode = type === "OFFLINE_UNLOCK_CODE";
    const nowMs = Date.now();
    const graceUntil = Math.min(detectedAtMs ?? nowMs, nowMs) + OFFLINE_UNLOCK_GRACE_MINUTES * 60_000;
    const graceOpen = graceUntil > nowMs;
    const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-LK", { timeZone: "Asia/Colombo", hour: "numeric", minute: "2-digit" });
    const details = isCode
      ? `${b.details ?? "Unlocked with a shop unlock code"} — ${graceOpen ? `open until ${clock(graceUntil)}, then locks again if still unpaid` : `reported late; the ${OFFLINE_UNLOCK_GRACE_MINUTES}-minute window had already ended`}`
      : b.details ?? null;
    // Cross-check: was an unlock code really issued for this phone shortly before it was typed? Codes
    // are only valid for 30 minutes (+5 min clock slack), so one must have been made in that window.
    // If none was, the event is left "new" for staff to look at. Nothing is blocked — the phone already
    // unlocked itself — this only makes an unexpected unlock visible.
    let unverified = false;
    if (isCode && enr.device_id) {
      const typedAt = Math.min(detectedAtMs ?? nowMs, nowMs);
      const { data: issued, error: keyErr } = await admin.from("temporary_unlock_keys").select("id")
        .eq("device_id", enr.device_id)
        .gte("created_at", new Date(typedAt - 45 * 60_000).toISOString())
        .lte("created_at", new Date(typedAt + 10 * 60_000).toISOString())
        .limit(1).maybeSingle();
      unverified = !keyErr && !issued;
    }
    await admin.from("device_security_events").insert({
      shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id,
      event_type: type,
      details: unverified ? `${details ?? ""} — ⚠ no unlock code was created for this phone on the website around that time; please check`.trim() : details,
      status: isCode ? (unverified ? "new" : "resolved") : "new",
    });
    // The customer unlocked the phone with a shop-issued offline code. Clear the restriction so the
    // next heartbeat's reconcile keeps it unlocked instead of re-locking. Generating the code no
    // longer unlocks remotely, so THIS is the point the server learns the phone is now unlocked.
    if (isCode) {
      const agreementId = enr.agreement_id ?? await resolveAgreementId(admin, enr);
      if (agreementId) {
        await admin.from("installment_agreements").update({ restriction: "active", restriction_reason: null }).eq("id", agreementId);
        // Hold off the overdue lock until the window ends (see lib/billing/overdue-lock.ts). Separate
        // step so a database without the column (migration 0018 not run) still unlocks as before.
        // Never shortens a window that is already open.
        if (graceOpen) {
          const iso = new Date(graceUntil).toISOString();
          const { error } = await admin.from("installment_agreements").update({ unlock_grace_until: iso })
            .eq("id", agreementId).or(`unlock_grace_until.is.null,unlock_grace_until.lt.${iso}`);
          if (error) console.warn("[security-event] unlock window not saved (run migration 0018_unlock_grace.sql):", error.message);
        }
      }
    }
  }
  return Response.json({ success: true, data: null, message: "recorded" });
}

type Admin = ReturnType<typeof createAdminClient>;
type EnrRow = { id: string; shop_id: string; device_id: string | null; customer_id: string | null; agreement_id: string | null };

/**
 * The phone was freed with an offline release code. The enrollment is always marked released and its
 * token wiped (the shop's channel to this phone ends). The agreement and the phone record are marked
 * released only when nothing is owed — if money is still owed the agreement stays open with its
 * balance, so the debt is not lost and the phone can be set up again for the same customer.
 */
async function recordOfflineRelease(admin: Admin, enr: EnrRow, details: string | null, atMs: number | null) {
  const now = new Date().toISOString();
  await admin.from("device_enrollments").update({ status: "released", device_token_hash: null, management_active: false, updated_at: now }).eq("id", enr.id);
  const agreementId = enr.agreement_id ?? await resolveAgreementId(admin, enr);
  let owed = 0;
  if (agreementId) {
    const { data: a } = await admin.from("installment_agreements").select("outstanding_balance").eq("id", agreementId).maybeSingle();
    owed = Math.max(0, Number(a?.outstanding_balance || 0));
  }
  if (owed <= 0 && enr.device_id) {
    await admin.from("devices").update({ status: "released" }).eq("id", enr.device_id);
    await admin.from("installment_agreements").update({ restriction: "active", status: "released" })
      .eq("device_id", enr.device_id).not("status", "in", "(cancelled,released)");
  }
  const when = atMs ? new Date(Math.min(atMs, Date.now())).toLocaleString("en-LK", { timeZone: "Asia/Colombo" }) : null;
  await admin.from("device_security_events").insert({
    shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id, event_type: "OFFLINE_RELEASE_CODE",
    details: `${details ?? "Released on the phone with a shop release code"}${when ? ` (${when})` : ""}${owed > 0 ? ` — Rs ${Math.round(owed).toLocaleString("en-LK")} still owed; the agreement stays open` : ""}`,
    status: "resolved",
  });
  await admin.from("audit_logs").insert({
    shop_id: enr.shop_id, actor_id: null, action: "offline_release_confirmed", entity: "device_enrollments", entity_id: enr.id,
    details: { device_id: enr.device_id, agreement_id: agreementId, owed, released_at: atMs ? new Date(atMs).toISOString() : null },
  });
}
