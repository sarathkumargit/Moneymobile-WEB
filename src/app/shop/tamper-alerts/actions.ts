"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/shared/flash";
import { rescore } from "@/lib/devices/tamper";
import { nudgePhoneByAgreement } from "@/lib/devices/nudge";

const canOperate = (role: string) => role === "shop_admin" || role === "employee";
const STATUS = { acknowledge: "acknowledged", resolve: "resolved", dismiss: "dismissed" } as const;

function revalidateAll() {
  revalidatePath("/shop/tamper-alerts");
  revalidatePath("/shop/device-management");
  revalidatePath("/super-admin/tamper-alerts");
}

/** Acknowledge (still counts), resolve (checked, fixed) or dismiss (false alarm) a tamper alert. */
export async function updateTamperAlert(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const id = String(fd.get("id") || "").trim();
  const action = String(fd.get("action") || "") as keyof typeof STATUS;
  const note = String(fd.get("note") || "").trim().slice(0, 300) || null;
  if (!id || !(action in STATUS)) return;
  const admin = createAdminClient();
  const { data: ev } = await admin.from("device_tamper_events").select("id,shop_id,enrollment_id,rule,status").eq("id", id).maybeSingle();
  if (!ev || ev.shop_id !== s.profile.shop_id) return;
  const status = STATUS[action];
  const patch: Record<string, unknown> = { status };
  if (status !== "acknowledged") { patch.resolved_at = new Date().toISOString(); patch.resolved_by = s.user.id; patch.resolution_note = note; }
  await admin.from("device_tamper_events").update(patch).eq("id", id);
  if (ev.enrollment_id) await rescore(admin, ev.enrollment_id);
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: `tamper_alert_${status}`, entity: "device_tamper_events", entity_id: id, details: { rule: ev.rule, note } });
  setFlash(status === "acknowledged" ? "Alert acknowledged." : status === "resolved" ? "Alert resolved." : "Alert dismissed as a false alarm.");
  revalidateAll();
}

/** Shop settings: automatic lock on a high tamper score, and strict USB (app 1.11.0+). Owner only. */
export async function saveTamperSettings(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || s.profile.role !== "shop_admin") return;
  const autoLock = fd.get("tamper_auto_lock") === "on";
  const strictUsb = fd.get("strict_usb") === "on";
  const threshold = Math.min(100, Math.max(20, Math.round(Number(fd.get("tamper_lock_threshold") || 60) || 60)));
  const admin = createAdminClient();
  const { error } = await admin.from("shops").update({ tamper_auto_lock: autoLock, tamper_lock_threshold: threshold, strict_usb: strictUsb }).eq("id", s.profile.shop_id);
  if (error) { setFlash(/does not exist|schema cache/i.test(error.message) ? "Run migration 0027_tamper_detection.sql first." : error.message, "error"); return; }
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "tamper_settings_saved", entity: "shops", entity_id: s.profile.shop_id, details: { autoLock, threshold, strictUsb } });
  setFlash("Tamper settings saved.");
  revalidateAll();
}

/**
 * Lets one phone use USB debugging / file transfer for 30 minutes (servicing in the shop), then the strict
 * USB policy returns by itself. App 1.11.0+ only; the phone gets it on its next check-in.
 */
export async function allowUsbService(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || s.profile.role !== "shop_admin") return;
  const id = String(fd.get("enrollment_id") || "").trim();
  if (!id) return;
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,shop_id,device_id,agreement_id").eq("id", id).maybeSingle();
  if (!enr || enr.shop_id !== s.profile.shop_id) return;
  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await admin.from("device_enrollments").update({ usb_service_until: until }).eq("id", id);
  if (error) { setFlash("Run migration 0027_tamper_detection.sql first.", "error"); return; }
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "usb_service_window", entity: "device_enrollments", entity_id: id, details: { until } });
  if (enr.agreement_id || enr.device_id) await nudgePhoneByAgreement(admin, enr.agreement_id ?? "", enr.device_id);
  setFlash("USB service allowed for 30 minutes (phones with app 1.11.0 or newer).");
  revalidateAll();
}
