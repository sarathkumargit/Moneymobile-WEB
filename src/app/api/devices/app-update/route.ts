export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/devices/device-api";
import { PHONE_STATUSES, ACTIVE_STATUSES } from "@/lib/devices/app-updates";

// The phone reports how far an app update got: downloading | waiting | installing | installed | failed.
// Authenticated by the device token (same as heartbeat). Only an update that is still in progress can
// change, so a late report can never reopen a finished, failed or cancelled one.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b?.device_id || !b?.request_id) return Response.json({ success: false }, { status: 400 });
  const status = String(b.status ?? "");
  if (!(PHONE_STATUSES as readonly string[]).includes(status)) return Response.json({ success: false, message: "bad status" }, { status: 400 });

  const admin = createAdminClient();
  const { data: enr, error } = await admin.from("device_enrollments").select("id,device_token_hash").eq("id", b.device_id).maybeSingle();
  if (error) return Response.json({ success: false }, { status: 503 });
  if (!enr || !enr.device_token_hash || enr.device_token_hash !== sha256(b.device_token || "")) {
    return Response.json({ success: false }, { status: 401 });
  }

  const now = new Date().toISOString();
  const final = status === "installed" || status === "failed";
  const detail = typeof b.detail === "string" && b.detail.trim() ? b.detail.trim().slice(0, 300) : null;
  const { error: updErr } = await admin.from("device_app_updates")
    .update({ status, detail, updated_at: now, ...(final ? { finished_at: now } : {}) })
    .eq("id", String(b.request_id)).eq("enrollment_id", enr.id)
    .in("status", ACTIVE_STATUSES as unknown as string[]);
  if (updErr) return Response.json({ success: false }, { status: 503 });
  if (Number.isInteger(b.version_code)) {
    await admin.from("device_enrollments").update({ app_version_code: b.version_code }).eq("id", enr.id);
  }
  return Response.json({ success: true });
}
