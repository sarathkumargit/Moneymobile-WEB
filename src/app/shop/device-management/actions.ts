"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceSnapshot } from "@/lib/devices/device-snapshot";
import { setFlash } from "@/lib/shared/flash";
import { sha256, newToken, resolveAgreementId } from "@/lib/devices/device-api";
import { sendFcmCommand } from "@/lib/devices/fcm";
import { randomUUID } from "crypto";
import { queueCommand, getOrCreateEnrollment, type EnrRef } from "@/lib/devices/device-commands";
import { linkEnrollment, imeiList } from "@/lib/devices/imei-link";
import { nudgePhoneByAgreement } from "@/lib/devices/nudge";
export type ActionState = { error?: string; success?: string; at?: number };

const canOperate = (role: string) => role === "shop_admin" || role === "employee";
const isLockOrUnlock = (c: string) => c === "LOCK_DEVICE" || c === "UNLOCK_DEVICE";

export async function generateEnrollmentToken(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return { error: "Not authorized" };
  const device_id = String(fd.get("device_id") || "").trim();
  const agreement_id = String(fd.get("agreement_id") || "").trim() || null;
  if (!device_id) return { error: "Select a device." };
  const supabase = createClient();
  const { data: dev } = await supabase.from("devices").select("customer_id").eq("id", device_id).single();
  const plain = newToken().slice(0, 12).toUpperCase();
  // one enrollment row per device — reuse it so tokens + commands stay on the same record
  const { data: existing } = await supabase.from("device_enrollments").select("id").eq("device_id", device_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    await supabase.from("device_enrollments").update({ enroll_token_hash: sha256(plain), status: "pending", agreement_id, customer_id: dev?.customer_id ?? null, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    const { error } = await supabase.from("device_enrollments").insert({ shop_id: s.profile.shop_id, device_id, agreement_id, customer_id: dev?.customer_id ?? null, enroll_token_hash: sha256(plain), status: "pending", created_by: s.user.id });
    if (error) return { error: error.message };
  }
  revalidatePath("/shop/device-management");
  return { success: `Enrollment token: ${plain} — enter this in the app during enrollment. Works once.` };
}

// Send a Firebase test push to a phone and tell staff to watch "Last sync" update. Lets you check
// whether a given SIM package lets Google's push through (Dialog/Hutch/Mobitel/Airtel).
export async function sendTestPush(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const device_id = String(fd.get("device_id") || "").trim();
  const customer_id = String(fd.get("customer_id") || "").trim() || null;
  if (!device_id) return;
  const supabase = createClient();
  const { data: enr } = await supabase.from("device_enrollments")
    .select("id,fcm_token,device_token_hash,status").eq("device_id", device_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!enr) { setFlash("This phone isn't set up yet.", "error"); }
  else if (enr.status === "released") { setFlash("This phone has been released.", "error"); }
  else if (!enr.fcm_token) { setFlash("No push token yet — the phone needs the new app (v1.5.0) and one check-in on Wi-Fi first.", "error"); }
  else {
    const r = await sendFcmCommand({ fcmToken: enr.fcm_token, deviceId: enr.id, deviceTokenHash: enr.device_token_hash as string | null, command: "SYNC", cmdId: randomUUID() });
    if (r.ok) setFlash("Test push sent. Watch 'Last sync' — if it updates in a few seconds, push works on this phone's connection.");
    else setFlash(`Push not delivered: ${r.reason}.`, "error");
  }
  if (customer_id) { revalidatePath(`/shop/customers/${customer_id}`); revalidatePath(`/employee/customers/${customer_id}`); }
}

// Device-centric command used by the customer page (works before the phone connects — the command queues)
export async function deviceCommand(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return { error: "Not authorized", at: Date.now() };
  const device_id = String(fd.get("device_id") || "").trim();
  const command = String(fd.get("command") || "").trim();
  const customer_id = String(fd.get("customer_id") || "").trim() || null;
  if (!device_id || !command) return { error: "Missing device or command.", at: Date.now() };
  // These buttons only ever send Lock / Unlock. Anything else (e.g. a RELEASE_DEVICE typed into the
  // form) must use its own checked flow — Release requires the phone to be fully paid.
  if (!isLockOrUnlock(command)) return { error: "Unknown command.", at: Date.now() };
  const supabase = createClient();
  const { data: rel } = await supabase.from("device_enrollments").select("status").eq("device_id", device_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (rel?.status === "released") return { error: "This phone has been released to the customer — the shop no longer controls it.", at: Date.now() };
  const enr = await getOrCreateEnrollment(supabase, s, device_id);
  if (!enr) return { error: "Could not find or create an enrollment for this phone.", at: Date.now() };
  const result = await queueCommand(supabase, s, enr, command, device_id, { holdOverdueLock: command === "UNLOCK_DEVICE" });
  if (customer_id) { revalidatePath(`/shop/customers/${customer_id}`); revalidatePath(`/employee/customers/${customer_id}`); }
  revalidatePath("/shop/device-management");
  return result;
}

// Final hand-over once the phone is fully paid. Queues RELEASE_DEVICE: the phone removes every
// restriction, gives up Device Owner (uninstall + factory reset work again) and stops checking in.
// When the phone confirms, /api/devices/command-ack marks the enrollment "released" and revokes its token.
export async function releaseDevice(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return { error: "Not authorized", at: Date.now() };
  const device_id = String(fd.get("device_id") || "").trim();
  const customer_id = String(fd.get("customer_id") || "").trim() || null;
  if (!device_id) return { error: "Missing device.", at: Date.now() };
  const supabase = createClient();

  const { data: row } = await supabase.from("device_enrollments").select("id,agreement_id,device_id,customer_id,status").eq("device_id", device_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return { error: "This phone was never enrolled, so there is nothing to release.", at: Date.now() };
  if (row.status === "released") return { error: "This phone is already released.", at: Date.now() };
  const enr = row as EnrRef;

  // Only a fully paid phone can be released: every live agreement on this phone must be at Rs 0.
  const agreementId = await resolveAgreementId(supabase as unknown as Parameters<typeof resolveAgreementId>[0], enr);
  const { data: agrs, error: aErr } = await supabase.from("installment_agreements").select("id,outstanding_balance,status")
    .or(agreementId ? `device_id.eq.${device_id},id.eq.${agreementId}` : `device_id.eq.${device_id}`);
  if (aErr) return { error: `Could not check the balance: ${aErr.message}`, at: Date.now() };
  const live = (agrs ?? []).filter((a: { status: string }) => !["cancelled", "released"].includes(a.status));
  const owing = live.reduce((sum: number, a: { outstanding_balance: number | null }) => sum + Math.max(0, Number(a.outstanding_balance || 0)), 0);
  if (owing > 0) return { error: `Can't release yet — Rs ${owing.toLocaleString()} is still outstanding on this phone.`, at: Date.now() };

  await supabase.from("device_commands").update({ status: "superseded", result: "replaced by release" }).eq("enrollment_id", enr.id).eq("status", "pending");
  const { error } = await supabase.from("device_commands").insert({ shop_id: s.profile.shop_id, enrollment_id: enr.id, device_id, command: "RELEASE_DEVICE", reason: "Fully paid", status: "pending", issued_by: s.user.id });
  if (error) return { error: `Could not queue release: ${error.message}`, at: Date.now() };

  // Make sure the phone isn't left locked while the release is in flight. The "released" status
  // on the enrollment, device and agreements is set only once the phone CONFIRMS (in command-ack),
  // so a failed release never leaves the dashboard thinking the phone was handed over.
  const ids = live.map((a: { id: string }) => a.id);
  if (ids.length) await supabase.from("installment_agreements").update({ restriction: "active" }).in("id", ids);
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "device_release_requested", entity: "device_enrollments", entity_id: enr.id, details: { device_id } });

  if (customer_id) { revalidatePath(`/shop/customers/${customer_id}`); revalidatePath(`/employee/customers/${customer_id}`); }
  revalidatePath("/shop/device-management");
  return { success: "Release queued. On its next check-in the phone removes all restrictions and MoneyMobile stops managing it.", at: Date.now() };
}

// Repossess / prepare a phone for resale. Clears its history, location and links so the SAME
// IMEI comes back as a fresh device, and marks it released (unmanaged) + back in stock.
// Does NOT require the balance to be zero — this is a shop decision when pulling a phone back.
export async function resetDeviceRecord(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const device_id = String(fd.get("device_id") || "").trim();
  const customer_id = String(fd.get("customer_id") || "").trim() || null;
  // Money still owed: only the owner, and only after confirming on the customer's page.
  const force = s.profile.role === "shop_admin" && fd.get("force") === "1";
  if (!device_id) return;
  const admin = createAdminClient();
  const { data: dev } = await admin.from("devices").select("id,shop_id,customer_id").eq("id", device_id).maybeSingle();
  if (!dev || dev.shop_id !== s.profile.shop_id) return;
  // Name the phone on its agreements/payments first (fills empty columns only, harmless on its own).
  await keepPhoneOnAgreements(admin, device_id);
  // Everything else happens in ONE database transaction (migration 0030): all done, or nothing changed.
  const { data, error } = await admin.rpc("reset_device_for_resale", { p_device: device_id, p_shop: s.profile.shop_id, p_actor: s.user.id, p_force: force });
  if (error) { setFlash(/reset_device_for_resale|does not exist|schema cache/i.test(error.message) ? "Run migration 0030_device_linking.sql in Supabase first. Nothing was changed." : `Nothing was changed: ${error.message}`, "error"); return; }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) { setFlash(r.error ?? "Could not reset the phone. Nothing was changed.", "error"); return; }
  setFlash("Phone reset for resale. Factory reset it, then run the setup file again — it comes back as a new phone.");
  const cid = customer_id ?? dev.customer_id;
  if (cid) { revalidatePath(`/shop/customers/${cid}`); revalidatePath(`/employee/customers/${cid}`); }
  revalidatePath("/shop/devices"); revalidatePath("/employee/devices"); revalidatePath("/shop/device-management");
}

// Remove a phone from the system completely (sold off / gone). Deletes the device and every
// record tied to it (registration, commands, alerts, locations, unlock codes). Agreements and
// payments stay on the customer for their history, just without the phone attached.
// Before a phone is unlinked, write its model + IMEI onto its agreements and their payments
// (where not already saved), so history still names the phone. Skips quietly before migration 0016.
async function keepPhoneOnAgreements(admin: ReturnType<typeof createAdminClient>, device_id: string) {
  const snap = await deviceSnapshot(admin, device_id);
  if (!snap.device_imei && !snap.device_model) return;
  const { data: agrs } = await admin.from("installment_agreements").select("id").eq("device_id", device_id);
  const ids = (agrs ?? []).map((a: { id: string }) => a.id);
  if (!ids.length) return;
  await admin.from("installment_agreements").update(snap).in("id", ids).is("device_imei", null);
  await admin.from("payment_transactions").update(snap).in("agreement_id", ids).is("device_imei", null);
}

export async function deleteDevice(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const device_id = String(fd.get("device_id") || "").trim();
  const force = s.profile.role === "shop_admin" && fd.get("force") === "1";
  if (!device_id) return;
  const admin = createAdminClient();
  const { data: dev } = await admin.from("devices").select("id,shop_id,brand,model,customer_id").eq("id", device_id).maybeSingle();
  if (!dev || dev.shop_id !== s.profile.shop_id) return;
  await keepPhoneOnAgreements(admin, device_id);
  // One database transaction (migration 0030): registrations, agreement links and the phone go together, or not at all.
  const { data, error } = await admin.rpc("delete_device_record", { p_device: device_id, p_shop: s.profile.shop_id, p_actor: s.user.id, p_force: force });
  if (error) { setFlash(/delete_device_record|does not exist|schema cache/i.test(error.message) ? "Run migration 0030_device_linking.sql in Supabase first. Nothing was changed." : `Could not delete the phone — nothing was changed: ${error.message}`, "error"); return; }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) { setFlash(r.error ?? "Could not delete the phone. Nothing was changed.", "error"); return; }
  setFlash(`${[dev.brand, dev.model].filter(Boolean).join(" ") || "Phone"} deleted.`);
  if (dev.customer_id) { revalidatePath(`/shop/customers/${dev.customer_id}`); revalidatePath(`/employee/customers/${dev.customer_id}`); }
  revalidatePath("/shop/devices"); revalidatePath("/employee/devices"); revalidatePath("/shop/device-management");
}

// kept for the Device Mgmt page (enrollment-based)
export async function issueCommand(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const enrollment_id = String(fd.get("enrollment_id") || "").trim();
  const command = String(fd.get("command") || "").trim();
  const device_id = String(fd.get("device_id") || "").trim() || null;
  if (!enrollment_id || !command || !isLockOrUnlock(command)) return;
  const supabase = createClient();
  const { data: row } = await supabase.from("device_enrollments").select("id,agreement_id,device_id,customer_id").eq("id", enrollment_id).maybeSingle();
  // Only a phone this staff member can see (RLS). Never fall back to ids typed into the form.
  if (!row) return;
  const enr = row as EnrRef;
  await queueCommand(supabase, s, enr, command, enr.device_id ?? device_id, { holdOverdueLock: command === "UNLOCK_DEVICE" });
  revalidatePath("/shop/device-management");
}

export async function resolveSecurityEvent(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const event_id = String(fd.get("event_id") || "").trim();
  const decision = String(fd.get("decision") || "").trim();
  const customer_id = String(fd.get("customer_id") || "").trim() || null;
  if (!event_id) return;
  const supabase = createClient();
  const approved = decision === "approved";
  await supabase.from("device_security_events").update({ status: approved ? "approved" : "rejected", resolved_by: s.user.id, resolved_at: new Date().toISOString() }).eq("id", event_id);
  if (approved) {
    // Approving the SIM event is the staff decision to let the customer use the phone: unlock it
    // (queue UNLOCK + clear the restriction, same as the Unlock button). Rejecting keeps it locked.
    const { data: ev } = await supabase.from("device_security_events").select("enrollment_id").eq("id", event_id).maybeSingle();
    const { data: enr } = ev?.enrollment_id
      ? await supabase.from("device_enrollments").select("id,agreement_id,device_id,customer_id").eq("id", ev.enrollment_id).maybeSingle()
      : { data: null };
    if (enr) await queueCommand(supabase, s, enr as EnrRef, "UNLOCK_DEVICE", (enr as EnrRef).device_id);
  }
  setFlash(approved ? "SIM approved — unlock sent to the phone." : "SIM rejected — the phone stays locked.");
  if (customer_id) { revalidatePath(`/shop/customers/${customer_id}`); revalidatePath(`/employee/customers/${customer_id}`); }
  revalidatePath("/shop/device-management");
}


// Remove an enrollment row that has no phone record behind it (e.g. a half-finished or stale entry).
// Phones that exist in inventory are removed with "Delete phone" instead.
export async function removeEnrollment(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const id = String(fd.get("enrollment_id") || "").trim();
  if (!id) return;
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,shop_id,imei1").eq("id", id).maybeSingle();
  if (!enr || enr.shop_id !== s.profile.shop_id) return;
  const { error } = await admin.from("device_enrollments").delete().eq("id", id);
  if (error) { setFlash(`Could not remove it: ${error.message}`, "error"); return; }
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "remove_enrollment", entity: "device_enrollments", entity_id: id, details: { imei: enr.imei1 } });
  setFlash("Entry removed.");
  revalidatePath("/shop/device-management");
}

// Device Mgmt -> "Needs linking": connect a phone that is set up and checking in, but was not matched to its phone
// record, to the record the staff member picks. One database transaction (migration 0030): links it, retires the
// record's unused old registrations and fills in the customer + agreement. "force" is owner-only.
export async function linkOrphanEnrollment(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const enrollmentId = String(fd.get("enrollment_id") || "").trim();
  const deviceId = String(fd.get("device_id") || "").trim();
  const force = s.profile.role === "shop_admin" && fd.get("force") === "on";
  if (!enrollmentId || !deviceId) { setFlash("Choose the phone record to link.", "error"); return; }
  const admin = createAdminClient();
  const [{ data: enr }, { data: dev }] = await Promise.all([
    admin.from("device_enrollments").select("id,shop_id,imei1,model,device_id,status").eq("id", enrollmentId).maybeSingle(),
    admin.from("devices").select("id,shop_id,imei1,imei2,brand,model,customer_id").eq("id", deviceId).maybeSingle(),
  ]);
  if (!enr || !dev || enr.shop_id !== s.profile.shop_id || dev.shop_id !== s.profile.shop_id) { setFlash("Phone not found.", "error"); return; }
  // The phone reported an IMEI and it is not this record's: almost certainly the wrong record.
  const reported = imeiList(enr.imei1);
  const record = imeiList(dev.imei1, dev.imei2);
  if (reported.length && record.length && !reported.some((x) => record.includes(x)) && !force) {
    setFlash(`This phone's IMEI (${reported[0]}) is not the IMEI on that record (${record.join(" / ")}). Check you picked the right customer${s.profile.role === "shop_admin" ? ", or tick “Link even if it doesn't match”" : ""}.`, "error");
    return;
  }
  const r = await linkEnrollment(admin, enrollmentId, deviceId, { actor: s.user.id, source: "manual", force });
  if (!r.ok) {
    setFlash(r.code === "other_active" && s.profile.role === "shop_admin"
      ? `${r.error} Tick “Link even if it doesn't match” to link it anyway.`
      : r.error ?? "Could not link the phone.", "error");
    return;
  }
  if (r.agreementId) await nudgePhoneByAgreement(admin, r.agreementId, deviceId);
  setFlash(`Linked to ${[dev.brand, dev.model].filter(Boolean).join(" ") || "the phone record"}${r.retired ? ` — ${r.retired} unused old registration${r.retired > 1 ? "s" : ""} retired` : ""}. It shows on the customer's page now.`);
  if (dev.customer_id) { revalidatePath(`/shop/customers/${dev.customer_id}`); revalidatePath(`/employee/customers/${dev.customer_id}`); }
  revalidatePath("/shop/device-management"); revalidatePath("/shop/devices");
}
