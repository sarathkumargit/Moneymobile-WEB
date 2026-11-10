export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeImei, findFinanced, rateLimited, logLookup, hashIp, signResult } from "@/lib/devices/imei-lookup";

// Public financed-phone check for technicians and tool makers (no login).
//   GET /api/public/imei-check?imei=353263210632193   or   POST { "imei": "..." }
// Answer: { ok, result: { imei_last4, financed, shop_name, shop_phone, checked_at }, sig, key_id, alg }
// sig = Ed25519 over JSON.stringify(result); public key at /api/public/imei-check/key. No customer data, ever.
async function handle(req: Request, raw: string | null) {
  const imei = normalizeImei(raw ?? "");
  if (!imei) return Response.json({ ok: false, message: "Enter the full 15-digit IMEI (dial *#06# on the phone)." }, { status: 400 });
  const admin = createAdminClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);
  if (await rateLimited(admin, ipHash)) return Response.json({ ok: false, message: "Too many checks from this connection. Try again later." }, { status: 429 });
  let shop: { name: string; phone: string | null } | null = null;
  try { shop = await findFinanced(admin, imei); } catch (e) {
    console.error("[imei-check]", (e as Error).message);
    return Response.json({ ok: false, message: "Temporary problem. Try again in a minute." }, { status: 503 });
  }
  await logLookup(admin, ipHash, imei, !!shop);
  const result = { imei_last4: imei.slice(-4), financed: !!shop, shop_name: shop?.name ?? null, shop_phone: shop?.phone ?? null, checked_at: new Date().toISOString() };
  let signature: { sig: string; key_id: string } | null = null;
  try { signature = signResult(result); } catch (e) { console.error("[imei-check] signing:", (e as Error).message); }
  return Response.json({ ok: true, result, alg: "Ed25519", ...(signature ?? {}) }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  return handle(req, new URL(req.url).searchParams.get("imei"));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  return handle(req, b && typeof b.imei === "string" ? b.imei : null);
}
