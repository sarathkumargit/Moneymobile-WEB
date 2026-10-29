export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/devices/device-api";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ success: false, error: "bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,device_id,device_token_hash").eq("id", b.device_id).maybeSingle();
  if (!enr || enr.device_token_hash !== sha256(b.device_token || "")) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  await admin.from("device_commands").update({
    status: b.executed ? "acked" : "failed", result: b.result ?? null, acked_at: new Date().toISOString(),
  }).eq("id", b.command_id).eq("enrollment_id", enr.id);

  // Phone confirmed it released itself: mark the enrollment released and revoke its token,
  // so the shop has no further channel to this phone.
  if (b.executed) {
    const { data: cmd } = await admin.from("device_commands").select("command").eq("id", b.command_id).eq("enrollment_id", enr.id).maybeSingle();
    if (cmd?.command === "RELEASE_DEVICE") {
      // Phone confirmed it released itself — now record the hand-over everywhere and cut the
      // shop's channel to the phone (token wiped). This is the single source of truth for release.
      const now = new Date().toISOString();
      await admin.from("device_enrollments").update({
        status: "released", device_token_hash: null, management_active: false, updated_at: now,
      }).eq("id", enr.id);
      if (enr.device_id) {
        await admin.from("devices").update({ status: "released" }).eq("id", enr.device_id);
        await admin.from("installment_agreements").update({ restriction: "active", status: "released" })
          .eq("device_id", enr.device_id).not("status", "in", "(cancelled,released)");
      }
    }
  }
  return Response.json({ success: true, data: null, message: "ack" });
}
