export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/devices/device-api";

export async function GET(req: Request, { params }: { params: { deviceId: string } }) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const admin = createAdminClient();
  const { data: enr } = await admin.from("device_enrollments").select("id,device_token_hash").eq("id", params.deviceId).maybeSingle();
  if (!enr || enr.device_token_hash !== sha256(token)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  const { data: cmd } = await admin.from("device_commands").select("*").eq("enrollment_id", enr.id).eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!cmd) return Response.json({ success: true, data: null, message: "none" });
  await admin.from("device_commands").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", cmd.id);
  return Response.json({ success: true, data: { id: cmd.id, type: cmd.command, reason: cmd.reason, issued_at: cmd.created_at } });
}
