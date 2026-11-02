export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { createHash } from "crypto";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneServerOrigin } from "@/lib/devices/server-address";
import { kitApk } from "@/lib/devices/kit-apk";

// Shop setup details for the Install App page (browser USB setup + QR code). Signed-in shop
// admins/employees only — it contains the shop's setup secret.
let checksumCache: { key: string; sum: string } | null = null;

export async function GET(req: Request) {
  const session = await getSessionProfile();
  if (!session || !session.profile.shop_id || !["shop_admin", "employee"].includes(session.profile.role)) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("id,name,enroll_secret").eq("id", session.profile.shop_id).maybeSingle();
  if (!shop?.enroll_secret) return Response.json({ error: "This shop has no device setup secret yet. A shop admin can create it in Shop Settings." }, { status: 409 });

  // Same file /api/setup-kit/apk serves (newest published version, or the bundled one).
  let apk: { size: number; built: string; checksum: string } | null = null;
  const kit = await kitApk();
  if (kit) {
    const key = `${kit.source}:${kit.versionCode}:${kit.buf.length}`;
    if (!checksumCache || checksumCache.key !== key) {
      // QR setup verifies the download with a SHA-256 of the APK file (base64url, no padding).
      const sum = createHash("sha256").update(kit.buf).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      checksumCache = { key, sum };
    }
    apk = { size: kit.buf.length, built: (kit.builtAt ?? new Date()).toISOString(), checksum: checksumCache.sum };
  }

  const { origin, fromLocalhost } = phoneServerOrigin(req);
  return Response.json({
    shopId: shop.id,
    shopName: shop.name,
    secret: shop.enroll_secret,
    serverUrl: `${origin}/api`,
    apkUrl: `${origin}/api/setup-kit/apk`,
    fromLocalhost,
    apk,
  }, { headers: { "Cache-Control": "no-store" } });
}
