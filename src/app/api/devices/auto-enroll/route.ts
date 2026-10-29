export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, newToken, resolveAgreementId, buildAgreementStatus } from "@/lib/devices/device-api";

// Token-free enrollment used by the shop's setup file. The phone authenticates with the
// shop's own enroll_secret (baked into that shop's setup file) and identifies itself by IMEI.
// No enrollment token and no customer are needed — staff link the phone to a customer later
// on the website, found by its IMEI. One device + one enrollment row per (shop, IMEI).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ success: false, message: "Bad request" }, { status: 400 });

  const shopId = String(body.shop_id || "").trim();
  const secret = String(body.enroll_secret || "").trim();
  const di = body.device_info || {};
  const imei = (di.imei ? String(di.imei) : "").trim() || null;
  if (!shopId || !secret) return Response.json({ success: false, message: "Missing shop id or secret" }, { status: 400 });

  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("id,enroll_secret").eq("id", shopId).maybeSingle();
  if (!shop || !shop.enroll_secret || shop.enroll_secret !== secret) {
    return Response.json({ success: false, message: "This setup file is not valid for this shop." }, { status: 401 });
  }

  // Find or create the device row for this phone (identified by IMEI within the shop).
  let deviceId: string | null = null;
  if (imei) {
    const { data: dev } = await admin.from("devices").select("id").eq("shop_id", shopId).eq("imei1", imei).maybeSingle();
    if (dev) {
      deviceId = dev.id;
      await admin.from("devices").update({ brand: di.brand ?? null, model: di.model ?? null, enrollment: "enrolled" }).eq("id", dev.id);
    } else {
      const { data: created } = await admin.from("devices").insert({
        shop_id: shopId, brand: di.brand ?? null, model: di.model ?? null, imei1: imei,
        serial_number: di.serial_number ?? null, status: "in_stock", enrollment: "enrolled",
      }).select("id").single();
      deviceId = created?.id ?? null;
    }
  }

  // Find the existing enrollment for this device, if any, and whether this is a RESALE
  // (the phone was previously released). A resale gets a clean slate: old location, history
  // and management state are wiped so the returned phone shows up as a fresh device.
  const deviceToken = newToken();
  let enrId: string | null = null;
  let wasReleased = false;
  if (deviceId) {
    const { data: existing } = await admin.from("device_enrollments").select("id,status").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) { enrId = existing.id; wasReleased = existing.status === "released"; }
  }
  if (wasReleased && enrId && deviceId) {
    // Clear the previous owner's operational trail so it reads as a new phone.
    await admin.from("device_commands").delete().eq("enrollment_id", enrId);
    await admin.from("device_locations").delete().eq("enrollment_id", enrId);
    await admin.from("device_security_events").delete().eq("enrollment_id", enrId);
  }
  const row = {
    shop_id: shopId, device_id: deviceId, device_token_hash: sha256(deviceToken), status: "enrolled",
    manufacturer: di.brand ?? null, model: di.model ?? null, imei1: imei, serial_number: di.serial_number ?? null,
    android_version: di.android_version ?? null, app_version: di.app_version ?? null,
    sim_iccid: di.sim_iccid ?? null, sim_operator: di.sim_operator ?? null,
    last_sync: new Date().toISOString(), updated_at: new Date().toISOString(),
    // On a resale, wipe the stale location + management + old agreement link.
    ...(wasReleased ? { last_lat: null, last_lng: null, location_accuracy: null, location_at: null, management_active: false, management_checked_at: null, agreement_id: null } : {}),
  };
  if (enrId) {
    await admin.from("device_enrollments").update(row).eq("id", enrId);
    if (wasReleased && deviceId) await admin.from("devices").update({ status: "in_stock" }).eq("id", deviceId);
  } else {
    const { data: created, error } = await admin.from("device_enrollments")
      .insert({ ...row, enroll_token_hash: sha256(newToken()) }).select("id").single();
    if (error || !created) return Response.json({ success: false, message: error?.message || "Could not register device" }, { status: 500 });
    enrId = created.id;
  }

  // If this phone's device is already tied to an agreement, send its status down right away.
  const agreementId = await resolveAgreementId(admin, { device_id: deviceId });
  if (agreementId) await admin.from("device_enrollments").update({ agreement_id: agreementId }).eq("id", enrId);
  const agreement = await buildAgreementStatus(admin, agreementId);

  await admin.from("audit_logs").insert({ shop_id: shopId, action: "device_auto_enrolled", entity: "device_enrollments", entity_id: enrId, details: { imei, model: di.model ?? null } });
  return Response.json({ success: true, device_id: enrId, device_token: deviceToken, agreement, message: "Device registered" });
}
