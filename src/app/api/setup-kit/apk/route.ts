export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { kitApk } from "@/lib/devices/kit-apk";

// Public download of the MoneyMobile app. Used by QR setup (the phone downloads it during its
// welcome screens, before anyone can sign in) and by browser USB setup. The APK holds no secrets.
// Serves the newest published version (App Updates), or the bundled setup-kit file — see lib/devices/kit-apk.ts.
export async function GET() {
  const kit = await kitApk();
  if (!kit) return new Response("App file missing on the server (publish one on App Updates, or add setup-kit/MoneyMobile.apk)", { status: 404 });
  return new Response(new Uint8Array(kit.buf), {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="MoneyMobile.apk"',
      "Content-Length": String(kit.buf.length),
      "Cache-Control": "no-store",
    },
  });
}
