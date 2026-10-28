export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { promises as fs } from "fs";
import path from "path";

// Public download of the MoneyMobile app. Used by QR setup (the phone downloads it during its
// welcome screens, before anyone can sign in) and by browser USB setup. The APK holds no secrets.
export async function GET() {
  try {
    const apk = await fs.readFile(path.join(process.cwd(), "setup-kit", "MoneyMobile.apk"));
    return new Response(new Uint8Array(apk), {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="MoneyMobile.apk"',
        "Content-Length": String(apk.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("App file missing on the server (setup-kit/MoneyMobile.apk)", { status: 404 });
  }
}
