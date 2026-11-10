export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { signingKey } from "@/lib/devices/imei-lookup";

// Public key for checking /api/public/imei-check answers (Ed25519 over JSON.stringify(result)).
export async function GET() {
  try {
    const k = signingKey();
    return Response.json({ alg: "Ed25519", key_id: k.keyId, public_key_pem: k.pubPem }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
