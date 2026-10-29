import { resolveAgreementId } from "@/lib/devices/device-api";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
type Enr = { id: string; shop_id: string; device_id: string | null; customer_id?: string | null; agreement_id?: string | null };

/**
 * Records a SIM removal/change and locks the phone server-side (agreement restriction =
 * restricted), so every later heartbeat tells the phone "locked". Only staff can lift it:
 * Approve (unlocks) or the Unlock button. If an alert is already open for this phone, no
 * duplicate is created — the phone and the server can both detect the same event.
 */
export async function raiseSimAlert(admin: Admin, enr: Enr, eventType: string, details: string | null) {
  const { data: open } = await admin.from("device_security_events").select("id")
    .eq("enrollment_id", enr.id).eq("status", "approval_required").ilike("event_type", "%sim%").limit(1).maybeSingle();
  if (!open) {
    await admin.from("device_security_events").insert({
      shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id,
      event_type: eventType, details, status: "approval_required",
    });
  }
  const agreementId = await resolveAgreementId(admin, enr);
  if (agreementId) await admin.from("installment_agreements").update({ restriction: "restricted", restriction_reason: "sim" }).eq("id", agreementId);
}
