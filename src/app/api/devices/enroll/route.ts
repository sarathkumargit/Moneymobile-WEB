export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, newToken, resolveAgreementId, buildAgreementStatus } from "@/lib/devices/device-api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ success: false, message: "Bad request" }, { status: 400 });
  const token = body.enrollment_token || body.device_info?.enrollment_token;
  if (!token) return Response.json({ success: false, message: "Missing enrollment token" }, { status: 400 });

  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("*").eq("enroll_token_hash", sha256(token)).eq("status", "pending").maybeSingle();
  if (!enr) return Response.json({ success: false, message: "Invalid or already-used enrollment token" }, { status: 401 });

  const deviceToken = newToken();
  const di = body.device_info || {};
  await admin.from("device_enrollments").update({
    status: "enrolled", device_token_hash: sha256(deviceToken),
    manufacturer: di.brand ?? null, model: di.model ?? null, imei1: di.imei ?? null, serial_number: di.serial_number ?? null,
    android_version: di.android_version ?? null, app_version: di.app_version ?? null,
    sim_iccid: di.sim_iccid ?? null, sim_operator: di.sim_operator ?? null,
    last_sync: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", enr.id);
  if (enr.device_id) await admin.from("devices").update({ enrollment: "enrolled" }).eq("id", enr.device_id);

  if (typeof di.bootloader_state === "string") {
    await admin.from("device_enrollments").update({ bootloader_state: String(di.bootloader_state).slice(0, 16) }).eq("id", enr.id);
  }
  const agreementId = await resolveAgreementId(admin, enr);
  if (agreementId && agreementId !== enr.agreement_id) {
    await admin.from("device_enrollments").update({ agreement_id: agreementId }).eq("id", enr.id);
  }
  const agreement = await buildAgreementStatus(admin, agreementId);
  await admin.from("audit_logs").insert({ shop_id: enr.shop_id, action: "device_enrolled", entity: "device_enrollments", entity_id: enr.id, details: { model: di.model ?? null } });
  return Response.json({ success: true, device_id: enr.id, device_token: deviceToken, agreement, message: "Device enrolled" });
}
