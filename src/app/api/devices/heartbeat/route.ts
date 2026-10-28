export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, resolveAgreementId, buildAgreementStatus } from "@/lib/device-api";
import { raiseSimAlert } from "@/lib/sim-alert";
import { evaluateOverdueLock } from "@/lib/overdue-lock";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ success: false }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("*").eq("id", b.device_id).maybeSingle();
  if (!enr || !enr.device_token_hash || enr.device_token_hash !== sha256(b.device_token || "")) {
    return Response.json({ success: false }, { status: 401 });
  }
  // SIM-change detection (backup to the phone's own instant lock): flag it and lock server-side.
  const simState = b.sim_state === "absent" || b.sim_state === "present" ? (b.sim_state as string) : null;
  // App v1.4.0+ sends sim_watch: it detects SIM changes itself and reports them (with the time it
  // saw them) via security-event. Skipping the backup here stops an OLD removal — already
  // unlocked by staff while the phone was offline — from re-locking it when it reconnects.
  const phoneWatchesSim = b.sim_watch === true;
  if (phoneWatchesSim) {
    // no server-side backup needed
  } else if (enr.sim_iccid && b.sim_iccid && b.sim_iccid !== enr.sim_iccid) {
    await raiseSimAlert(admin, enr, "SIM_CHANGE", `SIM changed: ${enr.sim_iccid} → ${b.sim_iccid}`);
  } else if (simState === "absent" && enr.sim_state === "present") {
    // Backup for the phone's own instant lock: the SIM was there last check-in and is gone now.
    await raiseSimAlert(admin, enr, "SIM_REMOVED", "SIM card removed (detected at check-in)");
  }
  const now = new Date().toISOString();
  const base = {
    last_sync: now, sim_iccid: b.sim_iccid ?? enr.sim_iccid, sim_operator: b.sim_operator ?? enr.sim_operator,
    battery_level: b.battery_level ?? null, network_type: b.network_type ?? null, updated_at: now,
  };

  // Performance: the steps below are independent of each other, so they run in parallel.
  // Previously ~9 database round-trips ran one after another on every phone check-in, which
  // delayed the response (and any Lock/Unlock command in it) the phone was waiting for.

  const updateStatus = async () => {
    const { error: updErr } = await admin.from("device_enrollments")
      .update({ ...base, management_active: b.device_owner === true, management_checked_at: now })
      .eq("id", enr.id);
    if (updErr) {
      // Until migration 0005 is applied the management_* columns don't exist and PostgREST rejects
      // the whole update — last_sync never moved, so the dashboard showed the phone as not connected.
      console.error("[heartbeat] update failed, retrying without management columns (run migration 0005_management_status.sql):", updErr.message);
      const { error: retryErr } = await admin.from("device_enrollments").update(base).eq("id", enr.id);
      if (retryErr) console.error("[heartbeat] update failed:", retryErr.message);
    }
  };

  // Location (best-effort, isolated: if migration 0011 hasn't run yet this just logs and skips).
  const updateLocation = async () => {
    const lat = typeof b.latitude === "number" ? b.latitude : null;
    const lng = typeof b.longitude === "number" ? b.longitude : null;
    const acc = typeof b.location_accuracy === "number" ? Math.round(b.location_accuracy) : null;
    if (lat === null || lng === null) return;
    const { error: locErr } = await admin.from("device_enrollments")
      .update({ last_lat: lat, last_lng: lng, location_accuracy: acc, location_at: now }).eq("id", enr.id);
    if (locErr) {
      console.error("[heartbeat] location update failed (run migration 0011_device_location.sql):", locErr.message);
    } else if (!enr.location_at || Date.now() - new Date(enr.location_at).getTime() > 10 * 60 * 1000) {
      // Keep the history trail bounded: at most one point per ~10 minutes.
      const { error: histErr } = await admin.from("device_locations").insert({ shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id, lat, lng, accuracy: acc, recorded_at: now });
      if (histErr) console.error("[heartbeat] location history insert failed:", histErr.message);
    }
  };

  // Deliver the NEWEST pending command; older pending ones are stale (e.g. repeated Lock clicks).
  const takeCommand = async () => {
    const { data: cmd } = await admin.from("device_commands").select("id,command,reason,created_at").eq("enrollment_id", enr.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!cmd) return null;
    await Promise.all([
      admin.from("device_commands").update({ status: "superseded", result: "replaced by a newer command" })
        .eq("enrollment_id", enr.id).eq("status", "pending").neq("id", cmd.id),
      admin.from("device_commands").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", cmd.id),
    ]);
    return { id: cmd.id, type: cmd.command, reason: cmd.reason, issued_at: cmd.created_at };
  };

  const loadAgreement = async () => {
    const agreementId = await resolveAgreementId(admin, enr);
    // Persist the resolved link so it is permanent even if enrolled without one
    const persist = agreementId && agreementId !== enr.agreement_id
      ? admin.from("device_enrollments").update({ agreement_id: agreementId }).eq("id", enr.id).then(() => undefined)
      : Promise.resolve();
    await persist;
    // Lock/unlock for overdue payments BEFORE reading the status, so the result reflects it now.
    if (agreementId) { try { await evaluateOverdueLock(admin, agreementId); } catch (e) { console.warn("[heartbeat] overdue check skipped (run migration 0014):", (e as Error).message); } }
    return buildAgreementStatus(admin, agreementId);
  };

  // SIM state + app version (best-effort, isolated: skips quietly until migration 0013 is run).
  const updateSim = async () => {
    if (!simState && !b.app_version) return;
    const patch: Record<string, unknown> = {};
    if (simState) { patch.sim_state = simState; patch.sim_state_at = now; }
    if (b.app_version) patch.app_version = String(b.app_version).slice(0, 40);
    const { error } = await admin.from("device_enrollments").update(patch).eq("id", enr.id);
    if (error) {
      console.warn("[heartbeat] sim_state not saved (run migration 0013_sim_state.sql):", error.message);
      // app_version is an older column — still save it so the page shows which build is installed.
      if (b.app_version) await admin.from("device_enrollments").update({ app_version: String(b.app_version).slice(0, 40) }).eq("id", enr.id);
    }
  };

  // Store the phone's Firebase push token (best-effort, isolated: skips until migration 0017 is run).
  const updateFcm = async () => {
    if (!b.fcm_token || b.fcm_token === enr.fcm_token) return;
    const { error } = await admin.from("device_enrollments").update({ fcm_token: String(b.fcm_token) }).eq("id", enr.id);
    if (error) console.warn("[heartbeat] fcm_token not saved (run migration 0017_fcm_token.sql):", error.message);
  };

  const [, , command, agreement] = await Promise.all([updateStatus(), updateLocation(), takeCommand(), loadAgreement(), updateSim(), updateFcm()]);
  return Response.json({ success: true, command, agreement });
}
