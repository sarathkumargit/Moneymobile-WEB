import "server-only";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { readApkInfo } from "@/lib/devices/apk-info";
import { APP_BUCKET, APP_PACKAGE } from "@/lib/devices/app-updates";

// The app file the Install App setup kit (USB + QR) hands out: the NEWEST of
//   • the latest version published on Super Admin -> App Updates, and
//   • the file bundled in <project>/setup-kit/MoneyMobile.apk (publish-app.command).
// So publishing once on App Updates updates the setup kit too; the bundled file is the fallback
// when nothing is published (or the database / storage can't be reached).
// Only PUBLISHED versions are used here — a version in "testing" is only offered as an online update.

export type KitApk = { buf: Buffer; version: string | null; versionCode: number | null; builtAt: Date | null; source: "release" | "bundled" };
export type KitApkInfo = Omit<KitApk, "buf">;

const BUNDLED = path.join(process.cwd(), "setup-kit", "MoneyMobile.apk");
let bundledCache: { mtime: number; info: KitApkInfo; buf: Buffer } | null = null;
let releaseCache: { id: string; sha: string; buf: Buffer } | null = null;

type Rel = { id: string; version_code: number; version_name: string | null; storage_path: string; sha256: string; published_at: string | null };

async function bundled(withBuf: boolean): Promise<{ info: KitApkInfo; buf?: Buffer } | null> {
  try {
    const st = await fs.stat(BUNDLED);
    if (!bundledCache || bundledCache.mtime !== st.mtimeMs) {
      const buf = await fs.readFile(BUNDLED);
      const parsed = readApkInfo(buf);
      const txt = (await fs.readFile(path.join(process.cwd(), "setup-kit", "version.txt"), "utf8").catch(() => "")).trim() || null;
      bundledCache = { mtime: st.mtimeMs, buf, info: { version: parsed?.versionName ?? txt, versionCode: parsed?.versionCode ?? null, builtAt: st.mtime, source: "bundled" } };
    }
    return { info: bundledCache.info, ...(withBuf ? { buf: bundledCache.buf } : {}) };
  } catch {
    return null;
  }
}

async function latestPublished(): Promise<Rel | null> {
  try {
    const { data, error } = await createAdminClient().from("app_releases")
      .select("id,version_code,version_name,storage_path,sha256,published_at")
      .eq("status", "published").not("version_code", "is", null).not("sha256", "is", null)
      .order("version_code", { ascending: false }).limit(1).maybeSingle();
    return error || !data ? null : (data as Rel);
  } catch {
    return null;
  }
}

async function releaseBuf(r: Rel): Promise<Buffer | null> {
  if (releaseCache && releaseCache.id === r.id && releaseCache.sha === r.sha256) return releaseCache.buf;
  try {
    const { data, error } = await createAdminClient().storage.from(APP_BUCKET).download(r.storage_path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    // Hand out exactly the file the super admin uploaded and the server checked — nothing else.
    if (createHash("sha256").update(buf).digest("hex") !== r.sha256) return null;
    if (readApkInfo(buf)?.packageName !== APP_PACKAGE) return null;
    releaseCache = { id: r.id, sha: r.sha256, buf };
    return buf;
  } catch {
    return null;
  }
}

const relInfo = (r: Rel): KitApkInfo => ({ version: r.version_name ?? String(r.version_code), versionCode: r.version_code, builtAt: r.published_at ? new Date(r.published_at) : null, source: "release" });
const newer = (r: Rel | null, b: KitApkInfo | null | undefined) => !!r && (b?.versionCode == null || r.version_code > b.versionCode);

/** Version details only (no big download) — for the Install App and Settings pages. */
export async function kitApkInfo(): Promise<KitApkInfo | null> {
  const [r, b] = await Promise.all([latestPublished(), bundled(false)]);
  return newer(r, b?.info) ? relInfo(r!) : b?.info ?? null;
}

/** The file itself. Falls back to the bundled file if the published one can't be downloaded or checked. */
export async function kitApk(): Promise<KitApk | null> {
  const [r, b] = await Promise.all([latestPublished(), bundled(true)]);
  if (newer(r, b?.info)) {
    const buf = await releaseBuf(r!);
    if (buf) return { buf, ...relInfo(r!) };
    console.warn("[setup-kit] published app could not be downloaded or failed its check — using the bundled file");
  }
  return b?.buf ? { buf: b.buf, ...b.info } : null;
}

/**
 * Where a phone doing QR setup downloads the app, plus the checksum the QR must carry — chosen ONCE, so the
 * file the phone downloads is always exactly the file the checksum was made from.
 *
 * Why: the old QR pointed at /api/setup-kit/apk, a server function that picks "newest published, else bundled"
 * on every request and pulls the published file from storage first. Measured on the live site it took over
 * two minutes before the first byte, and if storage was slow on one request but not the other, the QR's
 * checksum and the downloaded file came from DIFFERENT files — Android then refuses to install it.
 *
 *  - Published release: a signed link straight to the file in Supabase Storage (served by its CDN, fast),
 *    checksum = the SHA-256 the server stored at upload. No download through our function at all.
 *  - Bundled file: /api/setup-kit/apk?src=bundled, which always serves the bundled file (never a release).
 */
export type KitDownload = { url: string; checksum: string; size: number; built: Date | null; version: string | null; versionCode: number | null; source: "release" | "bundled" };

const hexToBase64Url = (hex: string) => Buffer.from(hex, "hex").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const SIGNED_URL_SECONDS = 24 * 3600; // a QR is printed/shown in the shop and used the same day

export async function kitDownload(origin: string): Promise<KitDownload | null> {
  const [r, b] = await Promise.all([latestPublished(), bundled(true)]);
  if (newer(r, b?.info) && r && /^[0-9a-f]{64}$/i.test(r.sha256)) {
    try {
      const sb = createAdminClient();
      const [{ data: signed }, { data: row }] = await Promise.all([
        sb.storage.from(APP_BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_SECONDS),
        sb.from("app_releases").select("size_bytes").eq("id", r.id).maybeSingle(),
      ]);
      if (signed?.signedUrl) {
        return { url: signed.signedUrl, checksum: hexToBase64Url(r.sha256), size: Number((row as { size_bytes?: number } | null)?.size_bytes ?? 0), built: r.published_at ? new Date(r.published_at) : null, version: r.version_name ?? String(r.version_code), versionCode: r.version_code, source: "release" };
      }
    } catch (e) {
      console.warn("[setup-kit] signed link failed, using the bundled file:", (e as Error).message);
    }
  }
  if (!b?.buf) return null;
  const checksum = createHash("sha256").update(b.buf).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { url: `${origin}/api/setup-kit/apk?src=bundled&v=${b.info.versionCode ?? "0"}`, checksum, size: b.buf.length, built: b.info.builtAt, version: b.info.version, versionCode: b.info.versionCode, source: "bundled" };
}

/** Only the bundled setup-kit file (for QR links that were made from it). */
export async function bundledApk(): Promise<KitApk | null> {
  const b = await bundled(true);
  return b?.buf ? { buf: b.buf, ...b.info } : null;
}
