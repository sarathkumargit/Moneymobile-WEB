export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneServerOrigin } from "@/lib/devices/server-address";
import { kitDownload } from "@/lib/devices/kit-apk";

// Shop setup details for the Install App page (browser USB setup + QR code). Signed-in shop
// admins/employees only — it contains the shop's setup secret.

export async function GET(req: Request) {
  const session = await getSessionProfile();
  if (!session || !session.profile.shop_id || !["shop_admin", "employee"].includes(session.profile.role)) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("id,name,enroll_secret").eq("id", session.profile.shop_id).maybeSingle();
  if (!shop?.enroll_secret) return Response.json({ error: "This shop has no device setup secret yet. A shop admin can create it in Shop Settings." }, { status: 409 });

  const { origin, fromLocalhost } = phoneServerOrigin(req);
  // The exact file the phone will download + its checksum, chosen once (see kitDownload in lib/devices/kit-apk.ts).
  const dl = await kitDownload(origin);
  const apk = dl ? { size: dl.size, built: (dl.built ?? new Date()).toISOString(), checksum: dl.checksum, version: dl.version, source: dl.source } : null;

  return Response.json({
    shopId: shop.id,
    shopName: shop.name,
    secret: shop.enroll_secret,
    serverUrl: `${origin}/api`,
    apkUrl: dl?.url ?? `${origin}/api/setup-kit/apk`,
    fromLocalhost,
    apk,
  }, { headers: { "Cache-Control": "no-store" } });
}
