"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appVersionAtLeast } from "@/lib/devices/offline-unlock";
import { offlineReleaseCode, RELEASE_MIN_APP_VERSION, RELEASE_VALID_MINUTES } from "@/lib/devices/offline-release";

export type ReleaseCodeState = { error?: string; code?: string; expiresAt?: number; note?: string; owed?: number; needsConfirm?: boolean };

/**
 * "Offline release code" (shop owner only): a 10-digit code typed on the phone that removes ALL of
 * MoneyMobile's protection with no internet — for a test phone, a broken setup or a phone that can't
 * reach the server and must be wiped and set up again. Needs a reason; if money is still owed the
 * owner must confirm. Every code is written to the audit log (and so to the evidence chain).
 */
export async function generateReleaseCode(_p: ReleaseCodeState, fd: FormData): Promise<ReleaseCodeState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id) return { error: "Not authorized" };
  if (s.profile.role !== "shop_admin") return { error: "Only the shop owner can create a release code." };
  const enrollmentId = String(fd.get("enrollment_id") || "").trim();
  const reason = String(fd.get("reason") || "").trim().slice(0, 300);
  const confirmed = fd.get("confirm_owed") === "on";
  if (!enrollmentId) return { error: "No phone selected." };
  if (reason.length < 5) return { error: "Write why this phone is being released (at least 5 letters)." };

  // Staff client (RLS) proves the phone belongs to this shop; the token hash is read with the service client.
  const supabase = createClient();
  const { data: enr } = await supabase.from("device_enrollments")
    .select("id,shop_id,device_id,customer_id,agreement_id,status,app_version")
    .eq("id", enrollmentId).maybeSingle();
  if (!enr || enr.shop_id !== s.profile.shop_id) return { error: "Phone not found." };
  if (enr.status === "released") return { error: "This phone is already released." };
  const admin = createAdminClient();
  const { data: sec } = await admin.from("device_enrollments").select("device_token_hash").eq("id", enr.id).maybeSingle();
  if (!sec?.device_token_hash) return { error: "This phone never finished registering (no device key), so it can't check a code. Use recovery mode + the shop's Google account instead." };

  let owed = 0;
  if (enr.agreement_id) {
    const { data: a } = await admin.from("installment_agreements").select("outstanding_balance,status").eq("id", enr.agreement_id).maybeSingle();
    if (a && !["released", "cancelled", "completed"].includes(String(a.status))) owed = Math.max(0, Number(a.outstanding_balance || 0));
  }
  if (owed > 0 && !confirmed) return { needsConfirm: true, owed };

  const code = offlineReleaseCode(sec.device_token_hash, enr.id);
  const expiresAt = Date.now() + RELEASE_VALID_MINUTES * 60 * 1000;
  const appVersion = (enr as { app_version?: string | null }).app_version ?? null;
  await admin.from("audit_logs").insert({
    shop_id: s.profile.shop_id, actor_id: s.user.id, action: "offline_release_code_issued",
    entity: "device_enrollments", entity_id: enr.id,
    details: { reason, owed, device_id: enr.device_id, agreement_id: enr.agreement_id, valid_until: new Date(expiresAt).toISOString(), app_version: appVersion },
  });
  revalidatePath("/shop/device-management");
  if (enr.customer_id) revalidatePath(`/shop/customers/${enr.customer_id}`);

  const note = !appVersionAtLeast(appVersion, RELEASE_MIN_APP_VERSION)
    ? `This phone reports app v${appVersion ?? "?"}. Release codes need v${RELEASE_MIN_APP_VERSION} or newer — update the app first (if the phone can't go online, the code won't work).`
    : undefined;
  return { code, expiresAt, owed, note };
}
