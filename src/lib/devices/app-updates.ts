import "server-only";
import { signAppUpdate } from "@/lib/devices/command-sign";

// Online app updates — shared server logic. See supabase/migrations/0020_app_updates.sql.
//
// Flow: super admin uploads an APK (Super Admin -> App updates) and publishes it -> shop staff press
// "Update" on a phone -> a device_app_updates row is created -> the phone's next check-in (heartbeat)
// carries a signed offer -> the phone downloads, checks and installs it silently (Device Owner) and
// reports each step to /api/devices/app-update. Phones with no request never get anything, and an
// app older than ONLINE_UPDATE_MIN_CODE ignores the offer (it has no updater), so nothing changes for them.

export const APP_BUCKET = "app-releases";
export const APP_PACKAGE = "com.moneymobile.installment";
/** First app build that can update itself online (1.10.0). Older phones need one USB update first. */
export const ONLINE_UPDATE_MIN_CODE = 19;
export const ACTIVE_STATUSES = ["pending", "sent", "downloading", "waiting", "installing"] as const;
export const PHONE_STATUSES = ["downloading", "waiting", "installing", "installed", "failed"] as const;

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export type ReleaseRow = {
  id: string; version_code: number | null; version_name: string | null; storage_path: string;
  sha256: string | null; size_bytes: number | null; status: string; test_shop_ids: string[] | null;
  notes: string | null; created_at: string; published_at: string | null;
};

export function releaseVisibleToShop(r: Pick<ReleaseRow, "status" | "test_shop_ids">, shopId: string | null | undefined) {
  if (r.status === "published") return true;
  return r.status === "testing" && !!shopId && (r.test_shop_ids ?? []).includes(shopId);
}

export function isActive(status: string | null | undefined) {
  return !!status && (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Plain-language status for staff. */
export function statusText(status: string, detail?: string | null) {
  const d = detail ? ` — ${detail}` : "";
  switch (status) {
    case "pending": return "Waiting for the phone to check in";
    case "sent": return "Phone received the update request";
    case "downloading": return `Downloading on the phone${d}`;
    case "waiting": return `Paused on the phone${d}`;
    case "installing": return "Installing on the phone";
    case "installed": return `Installed${d}`;
    case "failed": return `Failed${d}`;
    case "cancelled": return `Cancelled${d}`;
    default: return status;
  }
}

/**
 * Heartbeat step. Saves the phone's build number and, when staff asked for an update, returns the
 * signed offer for the phone. Never throws: any problem (e.g. migration 0020 not run) returns null,
 * so a check-in always works exactly as before.
 */
export async function appUpdateForHeartbeat(
  admin: Admin,
  enr: { id: string; shop_id: string; app_version_code?: number | null },
  versionCode: number | null,
): Promise<Record<string, unknown> | null> {
  try {
    if (versionCode !== null && versionCode !== enr.app_version_code) {
      const { error } = await admin.from("device_enrollments").update({ app_version_code: versionCode }).eq("id", enr.id);
      if (error) { console.warn("[app-update] app_version_code not saved (run migration 0020_app_updates.sql):", error.message); return null; }
    }
    const { data: req, error } = await admin.from("device_app_updates")
      .select("id,status,release_id, app_releases(id,version_code,version_name,storage_path,sha256,size_bytes,status,test_shop_ids)")
      .eq("enrollment_id", enr.id).in("status", ACTIVE_STATUSES as unknown as string[])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !req) return null;
    const rel = (req as unknown as { app_releases: ReleaseRow | null }).app_releases;
    const now = new Date().toISOString();

    if (!rel || !releaseVisibleToShop(rel, enr.shop_id) || !rel.version_code || !rel.sha256 || !rel.size_bytes) {
      await admin.from("device_app_updates").update({ status: "cancelled", detail: "this app version was withdrawn", updated_at: now, finished_at: now }).eq("id", req.id);
      return null;
    }
    // The phone already runs this build (or newer): done — even if its own "installed" report was lost.
    if (versionCode !== null && versionCode >= rel.version_code) {
      await admin.from("device_app_updates").update({ status: "installed", detail: null, updated_at: now, finished_at: now }).eq("id", req.id);
      return null;
    }
    // An app without the updater can't act on the offer; don't pretend it received it.
    if (versionCode === null || versionCode < ONLINE_UPDATE_MIN_CODE) return null;

    const { data: signed } = await admin.storage.from(APP_BUCKET).createSignedUrl(rel.storage_path, 6 * 60 * 60);
    if (!signed?.signedUrl) return null;
    if (req.status === "pending") {
      await admin.from("device_app_updates").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", req.id);
    }
    const offer = {
      request_id: req.id as string,
      version_code: rel.version_code,
      version_name: rel.version_name ?? String(rel.version_code),
      url: signed.signedUrl,
      sha256: rel.sha256,
      size: Number(rel.size_bytes),
    };
    return { ...offer, sig: signAppUpdate(enr.id, offer) };
  } catch (e) {
    console.warn("[app-update] skipped:", (e as Error).message);
    return null;
  }
}

export type EnrForUpdate = {
  id: string; shop_id: string; status: string; last_sync: string | null; app_version: string | null;
  app_version_code: number | null; management_active?: boolean | null;
  fcm_token?: string | null; device_token_hash?: string | null;
};
export const ENR_UPDATE_COLS = "id,shop_id,status,last_sync,app_version,app_version_code,management_active,fcm_token,device_token_hash";

/** Why this phone can't be updated online right now (plain language), or null when it can. */
export function updateBlocker(e: EnrForUpdate, release: { version_code: number | null } | null): string | null {
  if (!release?.version_code) return "No app update is available.";
  if (e.status === "released") return "This phone was released to the customer and is no longer managed.";
  if (e.status === "revoked") return "This phone's registration was removed.";
  if (!e.last_sync) return "This phone hasn't connected yet.";
  if (e.app_version_code == null || e.app_version_code < ONLINE_UPDATE_MIN_CODE) {
    return `This phone has app ${e.app_version ? `v${e.app_version}` : "an older version"}, which can't update online. Update it once with the USB setup file (Install App). After that, it updates from here.`;
  }
  if (e.app_version_code >= release.version_code) return "Already up to date.";
  if (e.management_active === false) return "MoneyMobile isn't Device Owner on this phone, so it can't install updates by itself. Use the USB setup file.";
  return null;
}
