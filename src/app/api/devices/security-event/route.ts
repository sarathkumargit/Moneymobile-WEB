export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, resolveAgreementId } from "@/lib/device-api";
import { raiseSimAlert } from "@/lib/sim-alert";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ success: false, error: "bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,shop_id,device_id,customer_id,agreement_id,device_token_hash").eq("id", b.device_id).maybeSingle();
  if (!enr || enr.device_token_hash !== sha256(b.device_token || "")) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  const type = String(b.event_type ?? "unknown");
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
      admin.from("temporary_unlock_keys").select("id")
        .eq("device_id", enr.device_id).gt("created_at", since).limit(1).maybeSingle(),
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
    await admin.from("device_security_events").insert({
      shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id,
      event_type: type, details: b.details ?? null, status: type === "OFFLINE_UNLOCK_CODE" ? "resolved" : "new",
    });
    // The customer unlocked the phone with a shop-issued offline code. Clear the restriction so the
    // next heartbeat's reconcile keeps it unlocked instead of re-locking. Generating the code no
    // longer unlocks remotely, so THIS is the point the server learns the phone is now unlocked.
    if (type === "OFFLINE_UNLOCK_CODE") {
      const agreementId = enr.agreement_id ?? await resolveAgreementId(admin, enr);
      if (agreementId) await admin.from("installment_agreements").update({ restriction: "active", restriction_reason: null }).eq("id", agreementId);
    }
  }
  return Response.json({ success: true, data: null, message: "recorded" });
}
