export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, resolveAgreementId, buildAgreementStatus } from "@/lib/devices/device-api";
import { raiseSimAlert } from "@/lib/devices/sim-alert";
import { evaluateOverdueLock } from "@/lib/billing/overdue-lock";
import { commandKey, signCommand, signAgreement, signLaterDeadlines, signFrpAccounts } from "@/lib/devices/command-sign";
import { idsForShop } from "@/lib/devices/reset-protection";
import { appUpdateForHeartbeat } from "@/lib/devices/app-updates";
import { checkCheckinSignature } from "@/lib/devices/device-keys";
import { recordTamper, clearSilence, tamperNotice } from "@/lib/devices/tamper";
import { signUsbPolicy, signNotice } from "@/lib/devices/command-sign";
import { autoLinkOrphan } from "@/lib/devices/imei-link";

export async function POST(req: Request) {
  // Read the exact bytes first: app 1.11.0+ signs "<ts>.<body>" with its hardware key (lib/devices/device-keys.ts).
  const raw = await req.text().catch(() => "");
  let b: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { b = JSON.parse(raw); } catch { b = null; }
  if (!b || typeof b !== "object") return Response.json({ success: false }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr, error: enrErr } = await admin.from("device_enrollments").select("*").eq("id", b.device_id).maybeSingle();
  // A database hiccup is not "this phone is unknown": answering 401 would make the phone drop its
  // registration and register again. Say "try later" instead.
  if (enrErr) return Response.json({ success: false, message: "Temporary server problem" }, { status: 503 });
  if (!enr || !enr.device_token_hash || enr.device_token_hash !== sha256(b.device_token || "")) {
    return Response.json({ success: false }, { status: 401 });
  }
  // Registered without a phone record (no IMEI could be read at setup)? App 1.11.4+ reports both IMEIs on every
  // check-in, so match and link it now — the customer, agreement and lock state follow in this same reply.
  if (!enr.device_id && (b.imei || b.imei2)) {
    try {
      const linked = await autoLinkOrphan(admin, enr, [b.imei, b.imei2]);
      if (linked) Object.assign(enr, linked);
    } catch (e) { console.warn("[heartbeat] IMEI auto-link failed:", (e as Error).message); }
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
    let { data: cmd } = await admin.from("device_commands").select("id,command,reason,created_at").eq("enrollment_id", enr.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!cmd) {
      // Nothing new. But if the newest command was handed over and never confirmed (the response was
      // lost on a weak connection), hand it over again after 90 s. Only the NEWEST command is ever
      // repeated, so an old Lock can never come back after a later Unlock. The phone ignores an id it
      // already ran and simply confirms it again.
      const { data: latest } = await admin.from("device_commands").select("id,command,reason,created_at,status,sent_at")
        .eq("enrollment_id", enr.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const stale = latest?.status === "sent" && !!latest.sent_at && Date.now() - new Date(latest.sent_at as string).getTime() > 90_000;
      if (!latest || !stale) return null;
      cmd = { id: latest.id, command: latest.command, reason: latest.reason, created_at: latest.created_at };
    }
    await Promise.all([
      admin.from("device_commands").update({ status: "superseded", result: "replaced by a newer command" })
        .eq("enrollment_id", enr.id).eq("status", "pending").neq("id", cmd.id),
      admin.from("device_commands").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", cmd.id),
    ]);
    const out = { id: cmd.id, type: cmd.command as string, reason: cmd.reason, issued_at: cmd.created_at as string };
    return { ...out, sig: signCommand(enr.id, out) };
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

  // Online app update (app 1.10.0+): saves the build number and, only when staff pressed "Update" for this
  // phone, hands it a signed offer. Isolated: returns null on any problem, so the check-in is unaffected.
  const appVersionCode = Number.isInteger(b.app_version_code) ? (b.app_version_code as number) : null;
  const offerUpdate = () => appUpdateForHeartbeat(admin, enr, appVersionCode);

  // Reset protection (app 1.10.1+ reports what it really holds). Best-effort, isolated: skips until migration 0021.
  const saveFrpState = async () => {
    const st = typeof b.frp_state === "string" ? b.frp_state.slice(0, 20) : null;
    if (!st) return;
    const accounts = typeof b.frp_accounts === "string" ? b.frp_accounts.slice(0, 200) : null;
    const { error } = await admin.from("device_enrollments").update({ frp_state: st, frp_accounts: accounts, frp_checked_at: now }).eq("id", enr.id);
    if (error) console.warn("[heartbeat] frp_state not saved (run migration 0021_reset_protection.sql):", error.message);
  };
  // The shop's own Google account ID(s) + optional platform backup (FRP_ACCOUNT_IDS).
  const loadFrpIds = async () => { try { return await idsForShop(admin, enr.shop_id); } catch { return null; } };

  // Hardware key (app 1.11.0+): check the check-in signature, or hand out a challenge to create the key.
  // Isolated: problems only become tamper alerts, never a refused check-in.
  const body = b;
  const keyCheck = () => checkCheckinSignature(admin, enr, req.headers, raw, body);

  // Tamper signs the phone reports about itself (app 1.11.0+), plus "lost Device Owner". Best-effort.
  const deviceSignals = async () => {
    try {
      if (enr.tamper_score > 0) await clearSilence(admin, enr.id); // it is checking in, so it is not silent
      if (enr.management_active === true && body.device_owner === false) await recordTamper(admin, enr, "management_off", {});
      const adb = typeof body.adb_enabled === "boolean" ? body.adb_enabled : null;
      const dev = typeof body.dev_options === "boolean" ? body.dev_options : null;
      if (adb === null && dev === null) return;
      if (adb !== enr.adb_enabled || dev !== enr.dev_options) await admin.from("device_enrollments").update({ adb_enabled: adb, dev_options: dev }).eq("id", enr.id);
      if (adb) await recordTamper(admin, enr, "adb_enabled", {});
      else if (dev) await recordTamper(admin, enr, "dev_options", {});
    } catch (e) { console.warn("[heartbeat] tamper signals skipped:", (e as Error).message); }
  };

  // USB policy for app 1.11.0+: block USB debugging + file transfer at all times (shop setting, default on),
  // except during a staff "USB service" window. Signed, so a forged reply can't relax it.
  const usbPolicy = async () => {
    if (body.key_attest !== true) return null;
    try {
      const { data: shop, error } = await admin.from("shops").select("strict_usb").eq("id", enr.shop_id).maybeSingle();
      if (error || !shop) return null;
      const until = enr.usb_service_until ? new Date(enr.usb_service_until).getTime() : 0;
      const p = { strict: shop.strict_usb !== false, until: until > Date.now() ? until : 0 };
      return { ...p, sig: signUsbPolicy(enr.id, p) };
    } catch { return null; }
  };

  const [, , command, agreement, , , appUpdate, , frpIds, keyResult, , usb] = await Promise.all([updateStatus(), updateLocation(), takeCommand(), loadAgreement(), updateSim(), updateFcm(), offerUpdate(), saveFrpState(), loadFrpIds(), keyCheck(), deviceSignals(), usbPolicy()]);
  const signedAgreement = agreement
    ? {
        ...agreement,
        sig: signAgreement(enr.id, { id: agreement.id, locked: agreement.locked, overdue_lock_at: agreement.overdue_lock_at, server_time: agreement.server_time }),
        later_sig: signLaterDeadlines(enr.id, { id: agreement.id, later_lock_at: agreement.later_lock_at, server_time: agreement.server_time }),
      }
    : agreement;
  // Hand the signing key to a phone that has none yet (phones registered before signing existed).
  // Phones that already hold one never receive it again.
  const key = b.has_command_key === true ? null : commandKey(enr.id);
  // Reset protection: Google account(s) that must sign in after any factory reset (Android 11+) — the shop's
  // own (Shop Settings) plus the optional platform backup FRP_ACCOUNT_IDS. If the list could not be loaded
  // (database hiccup) the field is left out, so the phone keeps what it has instead of being told "none".
  const frpFields = frpIds ? { frp_account_ids: frpIds, frp_sig: signFrpAccounts(enr.id, frpIds) } : {};
  // Customer notice while a high-risk tamper alert is open (app 1.11.0+ shows it once per alert).
  const notice = body.key_attest === true ? await tamperNotice(admin, enr.id, agreement?.shop_name ?? "", agreement?.shop_phone ?? "") : null;
  const extras = {
    ...(keyResult?.attestChallenge ? { attest_challenge: keyResult.attestChallenge } : {}),
    ...(usb ? { usb_policy: usb } : {}),
    ...(notice ? { tamper_notice: { ...notice, sig: signNotice(enr.id, notice) } } : {}),
  };
  // app_update is only present when an update was requested; older apps ignore unknown fields.
  return Response.json({ success: true, command, agreement: signedAgreement, command_key: key, ...frpFields, ...(appUpdate ? { app_update: appUpdate } : {}), ...extras });
}
