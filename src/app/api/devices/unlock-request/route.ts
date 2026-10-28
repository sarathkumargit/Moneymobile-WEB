export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256, resolveAgreementId } from "@/lib/device-api";

// Phone → shop: the customer tapped "Request unlock". We record a request (with device +
// customer details) that staff see on the Unlock Requests page. Deduped: if a pending request
// already exists for this enrollment, we return it instead of stacking duplicates.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ success: false, error: "bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments")
    .select("id,shop_id,device_id,customer_id,agreement_id,imei1,model,device_token_hash,status")
    .eq("id", b.device_id).maybeSingle();
  if (!enr || enr.device_token_hash !== sha256(b.device_token || "")) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  if (enr.status === "released") return Response.json({ success: false, error: "device released" }, { status: 409 });

  const { data: existing } = await admin.from("device_unlock_requests")
    .select("id").eq("enrollment_id", enr.id).eq("status", "pending").maybeSingle();
  if (existing) return Response.json({ success: true, data: { id: existing.id, duplicate: true }, message: "A request is already pending" });

  const agreementId = await resolveAgreementId(admin, enr);
  let customerName: string | null = null;
  if (enr.customer_id) {
    const { data: cust } = await admin.from("customers").select("full_name").eq("id", enr.customer_id).maybeSingle();
    customerName = cust?.full_name ?? null;
  }

  const { data: inserted, error } = await admin.from("device_unlock_requests").insert({
    shop_id: enr.shop_id, enrollment_id: enr.id, device_id: enr.device_id, customer_id: enr.customer_id,
    agreement_id: agreementId, imei: b.imei ?? enr.imei1 ?? null, model: b.model ?? enr.model ?? null,
    customer_name: customerName, reason: (b.reason as string | undefined)?.slice(0, 500) ?? null, status: "pending",
  }).select("id").single();
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({ shop_id: enr.shop_id, action: "unlock_requested", entity: "device_unlock_requests", entity_id: inserted.id, details: { device_id: enr.device_id } });
  return Response.json({ success: true, data: { id: inserted.id }, message: "Request sent to the shop" });
}
