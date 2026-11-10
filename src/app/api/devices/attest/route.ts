export const runtime = "nodejs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/devices/device-api";
import { verifyAttestationChain, revokedSerials } from "@/lib/devices/attestation";
import { CHALLENGE_TTL_MS } from "@/lib/devices/device-keys";
import { recordTamper } from "@/lib/devices/tamper";

// App 1.11.0+: the phone proves the hardware key it just created (Android key attestation).
// Body: { device_id, device_token, challenge (base64, from the heartbeat), chain: [base64 DER, leaf first] }
// The server checks the chain against Google's roots + the challenge + our package name, then stores the
// public key. Every later check-in must be signed with it (lib/devices/device-keys.ts).
const PACKAGE = "com.moneymobile.installment";

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.device_id !== "string") return Response.json({ success: false, message: "Bad request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: enr, error: enrErr } = await admin.from("device_enrollments").select("*").eq("id", b.device_id).maybeSingle();
  if (enrErr) return Response.json({ success: false, message: "Temporary server problem" }, { status: 503 });
  if (!enr || !enr.device_token_hash || enr.device_token_hash !== sha256(String(b.device_token || ""))) {
    return Response.json({ success: false }, { status: 401 });
  }
  if (enr.attest_challenge === undefined) return Response.json({ success: false, message: "Key registration is not enabled yet (migration 0026)" }, { status: 409 });

  // The challenge must be the one this server handed out, and still fresh.
  const expected = typeof enr.attest_challenge === "string" ? enr.attest_challenge : "";
  const age = enr.attest_challenge_at ? Date.now() - new Date(enr.attest_challenge_at).getTime() : Infinity;
  if (!expected || age > CHALLENGE_TTL_MS || String(b.challenge || "") !== expected) {
    return Response.json({ success: false, message: "Challenge expired — the phone will get a new one on its next check-in" }, { status: 409 });
  }
  const chain: string[] = Array.isArray(b.chain) ? b.chain.map((c: unknown) => String(c)).slice(0, 10) : [];
  const check = verifyAttestationChain(chain, Buffer.from(expected, "base64"), PACKAGE);

  if (check.trust === "invalid" || !check.publicKeySpkiB64 || !check.keyFingerprint) {
    await recordTamper(admin, enr, "attestation_untrusted", { error: check.error });
    return Response.json({ success: false, message: `Key proof rejected: ${check.error ?? "invalid"}` }, { status: 400 });
  }
  if (!check.challengeOk) {
    return Response.json({ success: false, message: "Key proof does not contain this server's challenge" }, { status: 400 });
  }
  if (check.packageOk === false) {
    await recordTamper(admin, enr, "attestation_untrusted", { error: "key was not created by MoneyMobile", packages: check.description?.packageNames ?? [] });
    return Response.json({ success: false, message: "Key was not created by this app" }, { status: 400 });
  }

  const revoked = await revokedSerials();
  const isRevoked = revoked ? check.chainSerialsHex.some((s) => revoked.has(s)) : null;
  const d = check.description;
  const now = new Date().toISOString();

  // Retire any key still active for this phone (a replaced key is itself a tamper sign).
  const { data: old } = await admin.from("device_keys").update({ status: "replaced", replaced_at: now })
    .eq("enrollment_id", enr.id).eq("status", "active").select("id");
  if (old?.length) await recordTamper(admin, enr, "key_replaced", { replaced: old.length });

  const { data: ins, error } = await admin.from("device_keys").insert({
    enrollment_id: enr.id, shop_id: enr.shop_id, device_id: enr.device_id, status: "active",
    public_key_spki: check.publicKeySpkiB64, key_fp: check.keyFingerprint,
    trust: isRevoked ? "invalid" : check.trust, attestation_error: isRevoked ? "attestation key revoked by Google" : check.error,
    security_level: d?.attestationSecurityLevel ?? null, attestation_version: d?.attestationVersion ?? null,
    verified_boot_state: d?.verifiedBootState ?? null, device_locked: d?.deviceLocked ?? null,
    os_version: d?.osVersion ?? null, os_patch_level: d?.osPatchLevel ?? null,
    vendor_patch_level: d?.vendorPatchLevel ?? null, boot_patch_level: d?.bootPatchLevel ?? null,
    app_package_ok: check.packageOk, leaf_serial: check.leafSerialHex, revoked: isRevoked,
  }).select("id").single();
  if (error || !ins) return Response.json({ success: false, message: error?.message || "Could not save the key" }, { status: 500 });

  // What the secure chip says about the boot chain (more trustworthy than the app's own report).
  const patch: Record<string, unknown> = { key_state: "active", attest_challenge: null, attest_challenge_at: null };
  if (d?.verifiedBootState) patch.verified_boot_state = d.verifiedBootState;
  if (d?.deviceLocked === true || d?.deviceLocked === false) patch.bootloader_state = d.deviceLocked ? "locked" : "unlocked";
  const { error: upErr } = await admin.from("device_enrollments").update(patch).eq("id", enr.id);
  if (upErr) { delete patch.bootloader_state; await admin.from("device_enrollments").update(patch).eq("id", enr.id); }

  if (check.trust !== "google" || isRevoked) await recordTamper(admin, enr, "attestation_untrusted", { error: isRevoked ? "revoked" : check.error });
  if (d?.deviceLocked === false) await recordTamper(admin, enr, "bootloader_unlocked", { source: "attestation" });
  if (d && d.verifiedBootState !== "verified" && d.verifiedBootState !== "unknown") await recordTamper(admin, enr, "boot_not_verified", { state: d.verifiedBootState });

  await admin.from("audit_logs").insert({ shop_id: enr.shop_id, actor_id: null, action: "device_key_registered", entity: "device_enrollments", entity_id: enr.id, details: { trust: check.trust, security_level: d?.attestationSecurityLevel, boot: d?.verifiedBootState, locked: d?.deviceLocked, fp: check.keyFingerprint.slice(0, 16) } });
  return Response.json({ success: true, key_id: ins.id, trust: check.trust, security_level: d?.attestationSecurityLevel ?? "unknown" });
}
