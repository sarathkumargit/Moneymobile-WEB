import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "customer-docs";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Uploads an ID-card image to the private bucket and returns its storage path (or null).
// Never throws — a failed/absent upload just means no document is stored.
export async function uploadDoc(file: FormDataEntryValue | null, folder: string): Promise<string | null> {
  if (!file || typeof file === "string") return null;
  const f = file as File;
  if (!f.size) return null;
  if (!f.type.startsWith("image/")) return null;
  if (f.size > MAX_BYTES) return null;
  try {
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: f.type, upsert: false });
    if (error) { console.error("[storage] upload failed:", error.message); return null; }
    return path;
  } catch (e) {
    console.error("[storage] upload exception:", e);
    return null;
  }
}

// Signed URLs are reused while they have >10 min left. Before, every render signed a fresh URL —
// and the customer page re-renders every 5s while a Lock/Unlock is in flight — so each render was
// an extra Storage API call per photo AND a new URL, forcing the browser to re-download every
// NIC photo each time. A stable URL lets the browser cache the image.
const URL_TTL_S = 3600;
const MIN_LEFT_MS = 10 * 60 * 1000;
const urlCache = new Map<string, { url: string; exp: number }>();

// Short-lived signed URL for viewing a stored doc (bucket is private).
export async function signedDocUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp - Date.now() > MIN_LEFT_MS) return hit.url;
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, URL_TTL_S);
    const url = data?.signedUrl ?? null;
    if (url) {
      if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value as string); // bounded
      urlCache.set(path, { url, exp: Date.now() + URL_TTL_S * 1000 });
    }
    return url;
  } catch { return null; }
}
