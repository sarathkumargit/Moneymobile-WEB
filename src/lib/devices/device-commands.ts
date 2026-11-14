import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/auth";
import { sha256, newToken, resolveAgreementId } from "@/lib/devices/device-api";
import { sendFcmCommand } from "@/lib/devices/fcm";

// Shared by the device-management actions and the unlock-code action (moved here unchanged so
// both queue Lock/Unlock exactly the same way). Not a "use server" file on purpose: these helpers
// take a session object and must never be callable from the browser.
export type ActionState = { error?: string; success?: string; at?: number };

export type Supa = ReturnType<typeof createClient>;
export type Session = NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>;
export type EnrRef = { id: string; agreement_id: string | null; device_id: string | null; customer_id: string | null };

export async function getOrCreateEnrollment(supabase: Supa, s: Session, device_id: string): Promise<EnrRef | null> {
  const { data: existing } = await supabase.from("device_enrollments").select("id,agreement_id,device_id,customer_id").eq("device_id", device_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing as EnrRef;
  const { data: dev } = await supabase.from("devices").select("customer_id").eq("id", device_id).single();
  const { data: created } = await supabase.from("device_enrollments").insert({ shop_id: s.profile.shop_id, device_id, customer_id: dev?.customer_id ?? null, agreement_id: null, enroll_token_hash: sha256(newToken()), status: "pending", created_by: s.user.id }).select("id,agreement_id,device_id,customer_id").single();
  return (created as EnrRef) ?? null;
}

// Queues a command AND flips the agreement's restriction flag.
// The agreement is resolved exactly like the heartbeat does (resolveAgreementId), so the
// flag we set is the one the phone reads back. If they differ, the phone locks on the
// command and then the next heartbeat (locked:false) immediately unlocks it again.
// How long a staff Unlock (Unlock button / approved unlock request) keeps an OVERDUE phone open.
// Without this window the overdue lock came straight back on the next check-in (server) and within
// 15 seconds on the phone itself (its offline deadline had already passed), so Unlock never held.
// When it ends and the payment is still not recorded, the phone locks again — online or offline.
export const MANUAL_UNLOCK_HOURS = 24;

/** Opens the overdue-lock hold window (unlock_grace_until) on an agreement. Never shortens a window
 *  that is already open. Best-effort: without migration 0018 the column is missing and this only logs. */
export async function holdOverdueLock(supabase: Supa, agreementId: string, hours = MANUAL_UNLOCK_HOURS): Promise<void> {
  const iso = new Date(Date.now() + hours * 3600_000).toISOString();
  const { error } = await supabase.from("installment_agreements").update({ unlock_grace_until: iso })
    .eq("id", agreementId).or(`unlock_grace_until.is.null,unlock_grace_until.lt.${iso}`);
  if (error) console.warn("[unlock] hold window not saved (run migration 0018_unlock_grace.sql):", error.message);
}

export async function queueCommand(supabase: Supa, s: Session, enr: EnrRef, command: string, device_id: string | null, opts: { holdOverdueLock?: boolean } = {}): Promise<ActionState> {
  // Only the newest instruction matters: retire anything still waiting so repeated clicks
  // don't build a backlog the phone has to work through one check-in at a time.
  await supabase.from("device_commands").update({ status: "superseded", result: "replaced by a newer command" }).eq("enrollment_id", enr.id).eq("status", "pending");
  const { data: cmdRow, error } = await supabase.from("device_commands").insert({ shop_id: s.profile.shop_id, enrollment_id: enr.id, device_id: device_id ?? enr.device_id, command, status: "pending", issued_by: s.user.id }).select("id").single();
  if (error) return { error: `Could not queue command: ${error.message}`, at: Date.now() };

  const agreementId = await resolveAgreementId(supabase as unknown as Parameters<typeof resolveAgreementId>[0], enr);
  const restriction = command === "LOCK_DEVICE" ? "restricted" : command === "UNLOCK_DEVICE" ? "active" : null;
  if (agreementId && restriction) {
    // 'manual' marks a staff lock so an overdue-clearing payment never auto-unlocks it; Unlock clears the tag.
    const restrictionReason = command === "LOCK_DEVICE" ? "manual" : null;
    const { error: rErr } = await supabase.from("installment_agreements").update({ restriction, restriction_reason: restrictionReason }).eq("id", agreementId);
    if (rErr) return { error: `Command queued, but the agreement could not be updated: ${rErr.message}`, at: Date.now() };
    if (agreementId !== enr.agreement_id) await supabase.from("device_enrollments").update({ agreement_id: agreementId }).eq("id", enr.id);
    // Staff Unlock on an overdue phone: keep it open for MANUAL_UNLOCK_HOURS instead of re-locking at once.
    if (command === "UNLOCK_DEVICE" && opts.holdOverdueLock) await holdOverdueLock(supabase, agreementId);
  }
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "device_command", entity: "device_commands", entity_id: device_id ?? enr.id, details: { command } });

  // Push it to the phone right now (Firebase). This reaches the phone even on limited data and even
  // if our website isn't reachable; it's best-effort — the queued command above is the guarantee.
  let pushed = false;
  if ((command === "LOCK_DEVICE" || command === "UNLOCK_DEVICE") && cmdRow?.id) {
    const { data: e2, error: e2Err } = await supabase.from("device_enrollments").select("fcm_token,device_token_hash").eq("id", enr.id).maybeSingle();
    if (!e2Err && e2?.fcm_token) {
      const r = await sendFcmCommand({
        fcmToken: e2.fcm_token, deviceId: enr.id, deviceTokenHash: e2.device_token_hash as string | null,
        command: command === "LOCK_DEVICE" ? "LOCK" : "UNLOCK", cmdId: cmdRow.id,
      });
      pushed = r.ok;
    }
  }

  const label = command === "LOCK_DEVICE" ? "Lock" : command === "UNLOCK_DEVICE" ? "Unlock" : command;
  const how = pushed
    ? "The phone was pushed the command now and applies it within seconds if it has any connection."
    : "The phone applies it on its next check-in (about a minute while it is online).";
  return { success: `${label} command queued. ${how}`, at: Date.now() };
}

