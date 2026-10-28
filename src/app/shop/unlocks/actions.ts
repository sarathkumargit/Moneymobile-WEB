"use server";
import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveAgreementId } from "@/lib/device-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueCommand, type EnrRef } from "@/lib/device-commands";
import { offlineUnlockCode, supportsOfflineCode, OFFLINE_VALID_MINUTES, OFFLINE_MIN_APP_VERSION } from "@/lib/offline-unlock";
export type ActionState = { error?: string; success?: string; code?: string; expiresAt?: number; note?: string };

const canOperate = (role: string) => role === "shop_admin" || role === "employee";

// Approve a customer's unlock request: queue UNLOCK_DEVICE to the phone (applied on next check-in)
// and clear the agreement restriction, exactly like the dashboard Unlock button.
export async function resolveUnlockRequest(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const request_id = String(fd.get("request_id") || "").trim();
  const decision = String(fd.get("decision") || "").trim();
  if (!request_id) return;
  const supabase = createClient();
  const { data: reqRow } = await supabase.from("device_unlock_requests").select("id,enrollment_id,device_id,agreement_id,status").eq("id", request_id).maybeSingle();
  if (!reqRow || reqRow.status !== "pending") return;

  if (decision === "approved" && reqRow.enrollment_id) {
    await supabase.from("device_commands").update({ status: "superseded", result: "replaced by unlock approval" }).eq("enrollment_id", reqRow.enrollment_id).eq("status", "pending");
    await supabase.from("device_commands").insert({ shop_id: s.profile.shop_id, enrollment_id: reqRow.enrollment_id, device_id: reqRow.device_id, command: "UNLOCK_DEVICE", reason: "Customer request approved", status: "pending", issued_by: s.user.id });
    const agreementId = reqRow.agreement_id ?? await resolveAgreementId(supabase as unknown as Parameters<typeof resolveAgreementId>[0], reqRow);
    if (agreementId) await supabase.from("installment_agreements").update({ restriction: "active" }).eq("id", agreementId);
  }

  await supabase.from("device_unlock_requests").update({ status: decision === "approved" ? "approved" : "rejected", resolved_by: s.user.id, resolved_at: new Date().toISOString() }).eq("id", request_id);
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: `unlock_request_${decision}`, entity: "device_unlock_requests", entity_id: request_id, details: {} });
  revalidatePath("/shop/unlocks");
  revalidatePath("/employee/unlocks");
}
// "30-min unlock code": a 6-digit code the customer types on the LOCKED phone. The phone checks it
// by itself, so it works with no Wi-Fi / no SIM (see lib/offline-unlock.ts). Generating it also
// queues a normal Unlock, so the phone stays unlocked when it next connects instead of re-locking.
export async function generateUnlockKey(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return { error: "Not authorized" };
  const device_id = String(fd.get("device_id") || "").trim() || null;
  const agreement_id = String(fd.get("agreement_id") || "").trim() || null;
  if (!device_id) return { error: "Select a device." };
  const supabase = createClient();
  // Staff client (RLS) proves this phone belongs to the staff member's shop…
  const { data: enr } = await supabase.from("device_enrollments")
    .select("id,shop_id,device_id,customer_id,agreement_id,status,app_version")
    .eq("device_id", device_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!enr || enr.shop_id !== s.profile.shop_id) return { error: "This phone hasn't been set up with the app yet." };
  if (enr.status === "released") return { error: "This phone has been released — the shop no longer controls it." };
  // …then the service client reads the device-token hash (the shared secret), never sent to the browser.
  const { data: sec } = await createAdminClient().from("device_enrollments").select("device_token_hash").eq("id", enr.id).maybeSingle();
  if (!sec?.device_token_hash) return { error: "This phone hasn't finished registering yet (no device key). Connect it to the internet once." };

  const code = offlineUnlockCode(sec.device_token_hash, enr.id);
  const expires_at = new Date(Date.now() + OFFLINE_VALID_MINUTES * 60 * 1000).toISOString();
  await supabase.from("temporary_unlock_keys").insert({
    shop_id: s.profile.shop_id, device_id, agreement_id: agreement_id ?? enr.agreement_id ?? null,
    key_hash: createHash("sha256").update(code).digest("hex"), status: "unused", expires_at, created_by: s.user.id,
  });
  // Same as pressing Unlock: clears the restriction + queues UNLOCK for when the phone is online.
  const queued = await queueCommand(supabase, s, enr as EnrRef, "UNLOCK_DEVICE", device_id);
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "generate_unlock_key", entity: "temporary_unlock_keys", entity_id: device_id, details: { expires_at, offline: true } });
  revalidatePath("/shop/unlocks");
  if (enr.customer_id) { revalidatePath(`/shop/customers/${enr.customer_id}`); revalidatePath(`/employee/customers/${enr.customer_id}`); }

  const old = !supportsOfflineCode((enr as { app_version?: string | null }).app_version);
  const note = old
    ? ` ⚠ This phone runs app v${(enr as { app_version?: string | null }).app_version ?? "?"} — the code box needs v${OFFLINE_MIN_APP_VERSION} or newer. Until it's updated, the phone unlocks only when it goes online.`
    : "";
  if (queued.error) return { error: `Code ${code} created, but: ${queued.error}` };
  return {
    code, expiresAt: Date.now() + OFFLINE_VALID_MINUTES * 60 * 1000, note: note.trim() || undefined,
    success: `Unlock code: ${code} — tell the customer to tap "Enter unlock code" on the locked phone. Works without internet for ${OFFLINE_VALID_MINUTES} minutes.${note}`,
  };
}
