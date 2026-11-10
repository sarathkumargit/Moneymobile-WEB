import "server-only";
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from "crypto";

// Financed-phone IMEI lookup for technicians (anti-unlock plan, Phase 6). See migration 0029.
// Answers only "financed by <shop> (phone)" or "not found" — never any customer detail.

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export function luhnOk(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = d.charCodeAt(d.length - 1 - i) - 48;
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** 15-digit IMEI with a valid check digit, or null. A 14-digit IMEI gets its check digit added. */
export function normalizeImei(input: string): string | null {
  const d = String(input || "").replace(/\D/g, "");
  if (d.length === 14) {
    for (let c = 0; c <= 9; c++) if (luhnOk(d + c)) return d + c;
    return null;
  }
  if (d.length !== 15 || /^(\d)\1{14}$/.test(d)) return null;
  return luhnOk(d) ? d : null;
}

// ───────────── signing key (Ed25519) ─────────────
// IMEI_CHECK_SIGNING_KEY = base64 of a 32-byte random seed (recommended; set it in Vercel). Without it the key is
// derived from the server secret, which is stable but changes if that secret is ever rotated.
let cached: { priv: KeyObject; pubPem: string; keyId: string } | null = null;
export function signingKey() {
  if (cached) return cached;
  const env = process.env.IMEI_CHECK_SIGNING_KEY;
  const seed = env ? Buffer.from(env, "base64") : createHash("sha256").update(`mm-imei-check:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "unset"}`).digest();
  if (seed.length !== 32) throw new Error("IMEI_CHECK_SIGNING_KEY must be 32 bytes (base64)");
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const priv = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  const spki = pub.export({ type: "spki", format: "der" }) as Buffer;
  cached = { priv, pubPem: pub.export({ type: "spki", format: "pem" }) as string, keyId: createHash("sha256").update(spki).digest("hex").slice(0, 16) };
  return cached;
}

export function signResult(result: object): { sig: string; key_id: string } {
  const k = signingKey();
  return { sig: cryptoSign(null, Buffer.from(JSON.stringify(result), "utf8"), k.priv).toString("base64"), key_id: k.keyId };
}

export const hashIp = (ip: string) => createHash("sha256").update(`mm-ip:${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 32);
export const hashImei = (imei: string) => createHash("sha256").update(`mm-imei:${imei}`).digest("hex").slice(0, 32);

/** Too many lookups from this address? (30 per hour, 200 per day). Without migration 0029: never limited. */
export async function rateLimited(admin: Admin, ipHash: string): Promise<boolean> {
  try {
    const hour = new Date(Date.now() - 3600_000).toISOString();
    const day = new Date(Date.now() - 86400_000).toISOString();
    const [h, d] = await Promise.all([
      admin.from("imei_lookup_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hour),
      admin.from("imei_lookup_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", day),
    ]);
    if (h.error || d.error) return false;
    return (h.count ?? 0) >= 30 || (d.count ?? 0) >= 200;
  } catch { return false; }
}

export async function logLookup(admin: Admin, ipHash: string, imei: string, financed: boolean) {
  try { await admin.from("imei_lookup_log").insert({ ip_hash: ipHash, imei_hash: hashImei(imei), financed }); } catch { /* 0029 not run */ }
}

/** Is a phone with this IMEI under a live agreement (money still owed)? Returns the shop to contact. */
export async function findFinanced(admin: Admin, imei: string): Promise<{ name: string; phone: string | null } | null> {
  const deviceIds = new Set<string>();
  const { data: devs } = await admin.from("devices").select("id").or(`imei1.eq.${imei},imei2.eq.${imei}`).limit(20);
  for (const d of (devs ?? []) as { id: string }[]) deviceIds.add(d.id);
  // Identity registry (migration 0023): every IMEI slot, platform-wide.
  try {
    const { data: ids } = await admin.from("device_identifiers").select("platform_device_id").eq("kind", "imei").eq("value_norm", imei).limit(5);
    const pds = ((ids ?? []) as { platform_device_id: string }[]).map((x) => x.platform_device_id);
    if (pds.length) {
      const { data: more } = await admin.from("devices").select("id").in("platform_device_id", pds).limit(20);
      for (const d of (more ?? []) as { id: string }[]) deviceIds.add(d.id);
    }
  } catch { /* registry not installed */ }

  type A = { id: string; shop_id: string; status: string; outstanding_balance: number | null };
  const live = (a: A) => !["cancelled", "released", "completed"].includes(a.status) && Number(a.outstanding_balance || 0) > 0;
  let agreements: A[] = [];
  if (deviceIds.size) {
    const { data } = await admin.from("installment_agreements").select("id,shop_id,status,outstanding_balance").in("device_id", Array.from(deviceIds)).limit(20);
    agreements = ((data ?? []) as A[]).filter(live);
  }
  if (!agreements.length) {
    // The phone record may have been reset/deleted while the agreement (with its saved IMEI) is still live.
    const { data, error } = await admin.from("installment_agreements").select("id,shop_id,status,outstanding_balance").eq("device_imei", imei).limit(20);
    if (!error) agreements = ((data ?? []) as A[]).filter(live);
  }
  for (const a of agreements) {
    const full = await admin.from("shops").select("name,phone,imei_lookup_enabled").eq("id", a.shop_id).maybeSingle();
    const shop = (full.error ? (await admin.from("shops").select("name,phone").eq("id", a.shop_id).maybeSingle()).data : full.data) as { name: string; phone: string | null; imei_lookup_enabled?: boolean } | null;
    if (shop && shop.imei_lookup_enabled !== false) return { name: shop.name, phone: shop.phone ?? null };
  }
  return null;
}
