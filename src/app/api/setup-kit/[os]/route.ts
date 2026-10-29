export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { promises as fs } from "fs";
import path from "path";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildZip, type ZipEntry } from "@/lib/shared/zip";
import { phoneServerOrigin } from "@/lib/devices/server-address";

// Downloads the phone setup kit for the signed-in user's shop, with config.txt already filled
// in (shop id + secret, and the server address when the site is opened by its network address).
// Files come from <project>/setup-kit — update MoneyMobile.apk there after each app build.
const KIT_DIR = path.join(process.cwd(), "setup-kit");

export async function GET(req: Request, { params }: { params: { os: string } }) {
  const os = params.os === "windows" ? "windows" : params.os === "mac" ? "mac" : null;
  if (!os) return new Response("Unknown platform", { status: 404 });

  const session = await getSessionProfile();
  if (!session || !session.profile.shop_id || !["shop_admin", "employee"].includes(session.profile.role)) {
    return new Response("Not authorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("id,name,enroll_secret").eq("id", session.profile.shop_id).maybeSingle();
  if (!shop?.enroll_secret) {
    return new Response("This shop has no device setup secret yet. A shop admin can create it in Shop Settings.", { status: 409 });
  }

  // The phone can't use "localhost" — leave SERVER_URL out then, and the setup file detects
  // this computer's Wi-Fi address itself. Opened via a real address, bake that in.
  // Server address for the phone: this site's network address (worked out from the computer's
  // Wi-Fi IP when the site is opened as localhost). The setup file still auto-detects if missing.
  const { origin } = phoneServerOrigin(req);
  const lines = [
    `# MoneyMobile setup config for ${shop.name ?? "your shop"} — generated ${new Date().toISOString()}`,
    `SHOP_ID=${shop.id}`,
    `SHOP_SECRET=${shop.enroll_secret}`,
    ...(/localhost|127\.0\.0\.1/.test(origin) ? [] : [`SERVER_URL=${origin}/api`]),
  ];
  const eol = os === "windows" ? "\r\n" : "\n";
  const toEol = (b: Buffer) => Buffer.from(b.toString("utf8").replace(/\r\n/g, "\n").replace(/\n/g, eol), "utf8");

  let apk: Buffer, readme: Buffer;
  try {
    [apk, readme] = await Promise.all([fs.readFile(path.join(KIT_DIR, "MoneyMobile.apk")), fs.readFile(path.join(KIT_DIR, "README.txt"))]);
  } catch {
    return new Response("Setup kit files are missing on the server (setup-kit/MoneyMobile.apk).", { status: 500 });
  }

  // One setup file per computer: it sets up a new phone OR just updates one that's already set up.
  const version = (await fs.readFile(path.join(KIT_DIR, "version.txt"), "utf8").catch(() => "")).trim();
  const folder = `MoneyMobile-Setup${version ? `-v${version}` : ""}-${os === "mac" ? "Mac" : "Windows"}`;
  const script = os === "mac" ? "setup-mac.command" : "setup-windows.bat";
  const setup = await fs.readFile(path.join(KIT_DIR, script));
  const entries: ZipEntry[] = [
    { name: `${folder}/MoneyMobile.apk`, data: apk },
    { name: `${folder}/config.txt`, data: Buffer.from(lines.join(eol) + eol, "utf8") },
    { name: `${folder}/README.txt`, data: toEol(readme) },
    // CRLF for cmd.exe; executable bit for macOS.
    { name: `${folder}/${script}`, data: toEol(setup), ...(os === "mac" ? { mode: 0o100755 } : {}) },
  ];

  const zip = buildZip(entries);
  await admin.from("audit_logs").insert({ shop_id: shop.id, actor_id: session.user.id, action: "setup_kit_downloaded", entity: "shops", entity_id: shop.id, details: { os } });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
