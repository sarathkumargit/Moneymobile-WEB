"use server";
import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/shared/flash";
import { readApkInfo } from "@/lib/devices/apk-info";
import { APP_BUCKET, APP_PACKAGE, ACTIVE_STATUSES } from "@/lib/devices/app-updates";

// Super admin: upload, test, publish and withdraw app builds for online updates.
// The APK goes straight from the browser to the private Supabase bucket through a one-time signed
// upload link (it is too big to pass through the website), then the server checks it here.

const MAX_BYTES = 100 * 1024 * 1024;
const PATH = "/super-admin/app-updates";

async function requireSuper() {
  const s = await getSessionProfile();
  return s && s.profile.role === "super_admin" ? s : null;
}

export type UploadStart = { error?: string; releaseId?: string; path?: string; token?: string };

export async function startReleaseUpload(fileName: string, size: number): Promise<UploadStart> {
  const s = await requireSuper();
  if (!s) return { error: "Not authorized" };
  if (!/\.apk$/i.test(fileName || "")) return { error: "Choose the app file (.apk)." };
  if (!(size > 0) || size > MAX_BYTES) return { error: "The file must be between 1 byte and 100 MB." };
  const supabase = createClient();
  const path = `releases/${randomUUID()}.apk`;
  const { data: row, error } = await supabase.from("app_releases")
    .insert({ storage_path: path, status: "uploading", created_by: s.user.id }).select("id").single();
  if (error || !row) {
    return { error: /app_releases/.test(error?.message ?? "") ? "Run supabase/migrations/0020_app_updates.sql in the Supabase SQL editor first." : (error?.message ?? "Could not start the upload.") };
  }
  const admin = createAdminClient();
  const { data: signed, error: sErr } = await admin.storage.from(APP_BUCKET).createSignedUploadUrl(path);
  if (sErr || !signed) {
    await supabase.from("app_releases").delete().eq("id", row.id);
    return { error: `Storage not ready: ${sErr?.message ?? "no upload link"}. Run migration 0020 (it creates the app-releases bucket).` };
  }
  return { releaseId: row.id, path, token: signed.token };
}

export type UploadFinish = { error?: string; success?: string };

// Checks the uploaded file. Anything wrong -> the file and its row are removed, nothing is offered.
export async function finishReleaseUpload(releaseId: string, notes: string): Promise<UploadFinish> {
  const s = await requireSuper();
  if (!s) return { error: "Not authorized" };
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: rel } = await supabase.from("app_releases").select("id,storage_path,status").eq("id", releaseId).maybeSingle();
  if (!rel || rel.status !== "uploading") return { error: "Upload not found." };

  const discard = async (msg: string): Promise<UploadFinish> => {
    await admin.storage.from(APP_BUCKET).remove([rel.storage_path]);
    await supabase.from("app_releases").delete().eq("id", rel.id);
    return { error: msg };
  };

  const { data: blob, error: dErr } = await admin.storage.from(APP_BUCKET).download(rel.storage_path);
  if (dErr || !blob) return discard("The upload did not arrive. Try again.");
  const buf = Buffer.from(await blob.arrayBuffer());
  const info = readApkInfo(buf);
  if (!info) return discard("That file is not a readable Android app (APK).");
  if (info.packageName !== APP_PACKAGE) return discard(`That is a different app (${info.packageName}), not MoneyMobile.`);

  const { data: newest } = await supabase.from("app_releases").select("version_code,version_name")
    .not("version_code", "is", null).order("version_code", { ascending: false }).limit(1).maybeSingle();
  if (newest?.version_code != null && info.versionCode <= newest.version_code) {
    return discard(`This build is ${info.versionName ?? info.versionCode} (build ${info.versionCode}), but build ${newest.version_code} (${newest.version_name ?? ""}) is already uploaded. Raise versionCode in app/build.gradle.kts and build again.`);
  }

  const hash = createHash("sha256").update(buf).digest("hex");
  const { error: uErr } = await supabase.from("app_releases").update({
    version_code: info.versionCode, version_name: info.versionName, sha256: hash, size_bytes: buf.length,
    notes: notes.trim().slice(0, 500) || null, status: "ready",
  }).eq("id", rel.id);
  if (uErr) return discard(uErr.message);
  revalidatePath(PATH);
  return { success: `Uploaded MoneyMobile ${info.versionName ?? ""} (build ${info.versionCode}). Test it in one shop first, then publish.` };
}

export async function changeReleaseStatus(fd: FormData): Promise<void> {
  const s = await requireSuper();
  if (!s) return;
  const id = String(fd.get("release_id") || "");
  const action = String(fd.get("action") || "");
  const shopId = String(fd.get("shop_id") || "").trim();
  const supabase = createClient();
  const { data: rel } = await supabase.from("app_releases").select("id,status,version_name,storage_path,test_shop_ids").eq("id", id).maybeSingle();
  if (!rel) { setFlash("Release not found.", "error"); return; }
  const name = rel.version_name ?? "this version";

  if (action === "test") {
    if (!shopId) { setFlash("Choose the shop to test in.", "error"); return; }
    if (rel.status !== "ready" && rel.status !== "testing" && rel.status !== "withdrawn") { setFlash("Only a version that isn't published can be tested.", "error"); return; }
    const ids = Array.from(new Set([...(rel.status === "testing" ? (rel.test_shop_ids as string[] ?? []) : []), shopId]));
    await supabase.from("app_releases").update({ status: "testing", test_shop_ids: ids }).eq("id", id);
    setFlash(`${name} is now available to test in the chosen shop. Update one phone there and check it before publishing.`);
  } else if (action === "publish") {
    if (rel.status !== "ready" && rel.status !== "testing" && rel.status !== "withdrawn") { setFlash("This version can't be published.", "error"); return; }
    await supabase.from("app_releases").update({ status: "published", published_at: new Date().toISOString() }).eq("id", id);
    setFlash(`${name} is published. Every shop now sees "Update available" for its phones.`);
  } else if (action === "withdraw") {
    if (rel.status !== "testing" && rel.status !== "published") { setFlash("Only a version in testing or published can be withdrawn.", "error"); return; }
    const now = new Date().toISOString();
    await supabase.from("app_releases").update({ status: "withdrawn" }).eq("id", id);
    await supabase.from("device_app_updates").update({ status: "cancelled", detail: "withdrawn by super admin", updated_at: now, finished_at: now })
      .eq("release_id", id).in("status", ACTIVE_STATUSES as unknown as string[]);
    setFlash(`${name} withdrawn. Phones that had not started installing it won't get it. Phones already updated keep it.`);
  } else if (action === "delete") {
    const { count } = await supabase.from("device_app_updates").select("id", { count: "exact", head: true }).eq("release_id", id);
    if ((count ?? 0) > 0 || rel.status === "published" || rel.status === "testing") { setFlash("This version was already sent to phones. Withdraw it instead.", "error"); return; }
    await createAdminClient().storage.from(APP_BUCKET).remove([rel.storage_path]);
    await supabase.from("app_releases").delete().eq("id", id);
    setFlash(`${name} deleted.`);
  }
  revalidatePath(PATH);
}
