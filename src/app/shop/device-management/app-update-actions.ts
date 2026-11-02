"use server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/shared/flash";
import { sendFcmCommand } from "@/lib/devices/fcm";
import { ACTIVE_STATUSES, ENR_UPDATE_COLS, updateBlocker, type EnrForUpdate } from "@/lib/devices/app-updates";

// Shop owner / employee: ask a phone to install the newest app version the super admin made available.
// Nothing installs until staff press Update. The phone picks the request up on its next check-in;
// a push wakes it so that happens within seconds when it is online.

const canOperate = (role: string) => role === "shop_admin" || role === "employee";
type Db = ReturnType<typeof createClient>;

async function targetRelease(supabase: Db) {
  // RLS returns only versions this shop may see (published, or testing in this shop).
  const { data } = await supabase.from("app_releases").select("id,version_code,version_name")
    .in("status", ["published", "testing"]).not("version_code", "is", null)
    .order("version_code", { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; version_code: number; version_name: string | null } | null;
}

function refresh(customerId?: string | null) {
  revalidatePath("/shop/device-management");
  if (customerId) { revalidatePath(`/shop/customers/${customerId}`); revalidatePath(`/employee/customers/${customerId}`); }
}

async function wake(e: EnrForUpdate) {
  if (!e.fcm_token) return;
  await sendFcmCommand({ fcmToken: e.fcm_token, deviceId: e.id, deviceTokenHash: e.device_token_hash ?? null, command: "SYNC", cmdId: randomUUID() }).catch(() => undefined);
}

async function queue(supabase: Db, userId: string, e: EnrForUpdate, releaseId: string) {
  const now = new Date().toISOString();
  // One update at a time per phone: an older unfinished request is replaced.
  await supabase.from("device_app_updates").update({ status: "cancelled", detail: "replaced by a newer request", updated_at: now, finished_at: now })
    .eq("enrollment_id", e.id).in("status", ["pending", "sent", "waiting"]);
  const { data: busy } = await supabase.from("device_app_updates").select("id").eq("enrollment_id", e.id).in("status", ["downloading", "installing"]).limit(1).maybeSingle();
  if (busy) return "This phone is already downloading or installing an update.";
  const { error } = await supabase.from("device_app_updates").insert({ shop_id: e.shop_id, enrollment_id: e.id, release_id: releaseId, status: "pending", requested_by: userId });
  return error ? error.message : null;
}

export async function requestAppUpdate(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const enrollmentId = String(fd.get("enrollment_id") || "");
  const customerId = String(fd.get("customer_id") || "") || null;
  const supabase = createClient();
  const [{ data: enr, error }, release] = await Promise.all([
    supabase.from("device_enrollments").select(ENR_UPDATE_COLS).eq("id", enrollmentId).maybeSingle(),
    targetRelease(supabase),
  ]);
  if (error || !enr) { setFlash(error ? "App updates need migration 0020_app_updates.sql." : "Phone not found.", "error"); return; }
  const e = enr as unknown as EnrForUpdate;
  const blocker = updateBlocker(e, release);
  if (blocker) { setFlash(blocker, "error"); refresh(customerId); return; }
  const err = await queue(supabase, s.user.id, e, release!.id);
  if (err) { setFlash(err, "error"); refresh(customerId); return; }
  await wake(e);
  setFlash(`Update to v${release!.version_name ?? release!.version_code} sent. The phone installs it by itself when it's online — the app keeps working normally until then.`);
  refresh(customerId);
}

export async function cancelAppUpdate(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !canOperate(s.profile.role)) return;
  const requestId = String(fd.get("request_id") || "");
  const customerId = String(fd.get("customer_id") || "") || null;
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data } = await supabase.from("device_app_updates")
    .update({ status: "cancelled", detail: "cancelled by staff", updated_at: now, finished_at: now })
    .eq("id", requestId).in("status", ["pending", "sent", "downloading", "waiting"]).select("id");
  setFlash(data?.length ? "Update cancelled. The phone keeps its current app." : "Too late to cancel — the phone is already installing it.", data?.length ? "success" : "error");
  refresh(customerId);
}

// Shop owner: send the update to every phone that can take it and isn't already updating.
export async function requestAppUpdateAll(): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || s.profile.role !== "shop_admin") return;
  const supabase = createClient();
  const release = await targetRelease(supabase);
  if (!release) { setFlash("No app update is available.", "error"); return; }
  const [{ data: enrs }, { data: active }] = await Promise.all([
    supabase.from("device_enrollments").select(ENR_UPDATE_COLS).eq("shop_id", s.profile.shop_id),
    supabase.from("device_app_updates").select("enrollment_id").eq("shop_id", s.profile.shop_id).in("status", ACTIVE_STATUSES as unknown as string[]),
  ]);
  const busy = new Set(((active ?? []) as { enrollment_id: string }[]).map((a) => a.enrollment_id));
  const eligible = ((enrs ?? []) as unknown as EnrForUpdate[]).filter((e) => !busy.has(e.id) && !updateBlocker(e, release));
  if (!eligible.length) { setFlash("No phones need this update right now (or they need the one-time USB update first).", "error"); refresh(); return; }
  const { error } = await supabase.from("device_app_updates").insert(eligible.map((e) => ({ shop_id: e.shop_id, enrollment_id: e.id, release_id: release.id, status: "pending", requested_by: s.user.id })));
  if (error) { setFlash(error.message, "error"); return; }
  await Promise.all(eligible.map(wake));
  setFlash(`Update to v${release.version_name ?? release.version_code} sent to ${eligible.length} phone${eligible.length > 1 ? "s" : ""}. Each installs it when it's online.`);
  refresh();
}
