import "server-only";
import { randomUUID } from "crypto";
import { sendFcmCommand } from "@/lib/devices/fcm";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

// Wakes the phone so it checks in right now (e.g. after a payment that clears its lock), instead of
// the customer waiting for the next scheduled check-in. Best-effort: never throws, never blocks the
// payment. Without a push token the phone still picks the change up on its normal ~1 minute check-in.
export async function nudgePhoneByAgreement(admin: Admin, agreementId: string, deviceId?: string | null): Promise<void> {
  try {
    const q = admin.from("device_enrollments").select("id,fcm_token,device_token_hash,status");
    const { data: enrs } = deviceId ? await q.eq("device_id", deviceId).order("created_at", { ascending: false }).limit(1)
                                    : await q.eq("agreement_id", agreementId).order("created_at", { ascending: false }).limit(1);
    const enr = enrs?.[0];
    if (!enr || enr.status === "released" || !enr.fcm_token) return;
    await sendFcmCommand({ fcmToken: enr.fcm_token, deviceId: enr.id, deviceTokenHash: enr.device_token_hash as string | null, command: "SYNC", cmdId: randomUUID() });
  } catch (e) {
    console.warn("[nudge] skipped:", (e as Error).message);
  }
}
