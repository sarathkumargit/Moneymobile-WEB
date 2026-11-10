import "server-only";
import { createPublicKey, randomBytes, verify as cryptoVerify } from "crypto";
import { recordTamper, type Enr } from "@/lib/devices/tamper";

// Hardware device keys + signed check-ins (anti-unlock plan, Phase 2). See migration 0026.
//
// The phone (app 1.11.0+) signs every check-in:  signature = ECDSA-SHA256( "<ts>." + <exact request body> )
// with the key in its secure chip, and sends headers X-MM-Ts (its trusted clock, epoch ms) and X-MM-Sig
// (base64 DER signature). The server checks it with the public key proven at /api/devices/attest.
//
// Nothing here ever blocks a check-in: problems only raise tamper alerts (Phase 3), so locking and payments
// keep working whatever happens to the key.

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

export const CHALLENGE_TTL_MS = 30 * 60 * 1000;

type ActiveKey = { id: string; public_key_spki: string; last_sig_ts: number | null; sig_ok_count: number | null; sig_fail_count: number | null };

/** True when the signature over "<ts>.<raw body>" is valid for the stored public key. */
export function verifyCheckinSignature(publicKeySpkiB64: string, ts: string, rawBody: string, sigB64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpkiB64, "base64"), format: "der", type: "spki" });
    const data = Buffer.concat([Buffer.from(`${ts}.`, "utf8"), Buffer.from(rawBody, "utf8")]);
    return cryptoVerify("sha256", data, key, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

export async function activeKey(admin: Admin, enrollmentId: string): Promise<{ key: ActiveKey | null; ready: boolean }> {
  const { data, error } = await admin.from("device_keys").select("id,public_key_spki,last_sig_ts,sig_ok_count,sig_fail_count")
    .eq("enrollment_id", enrollmentId).eq("status", "active").limit(1).maybeSingle();
  if (error) return { key: null, ready: false }; // migration 0026 not run
  return { key: (data as ActiveKey | null) ?? null, ready: true };
}

/** A fresh one-time challenge for /api/devices/attest (reuses a still-valid one). Base64, or null. */
async function challengeFor(admin: Admin, enr: { id: string; attest_challenge?: string | null; attest_challenge_at?: string | null }): Promise<string | null> {
  const age = enr.attest_challenge_at ? Date.now() - new Date(enr.attest_challenge_at).getTime() : Infinity;
  if (enr.attest_challenge && age < CHALLENGE_TTL_MS - 5 * 60 * 1000) return enr.attest_challenge;
  const ch = randomBytes(32).toString("base64");
  const { error } = await admin.from("device_enrollments").update({ attest_challenge: ch, attest_challenge_at: new Date().toISOString(), key_state: "pending" }).eq("id", enr.id);
  return error ? null : ch;
}

/**
 * Called on every check-in. Checks the hardware signature (when the phone has a key), records tamper signs,
 * and returns a challenge when a capable phone (1.11.0+) needs to (re)create its key.
 */
export async function checkCheckinSignature(
  admin: Admin,
  enr: Enr & { attest_challenge?: string | null; attest_challenge_at?: string | null; key_state?: string | null },
  headers: Headers,
  rawBody: string,
  b: { key_attest?: unknown; key_state?: unknown },
): Promise<{ attestChallenge: string | null }> {
  try {
    const capable = b.key_attest === true;
    const phoneKeyState = typeof b.key_state === "string" ? b.key_state : null;
    const { key, ready } = await activeKey(admin, enr.id);
    if (!ready) return { attestChallenge: null };

    const setState = async (s: string) => { if (enr.key_state !== s) await admin.from("device_enrollments").update({ key_state: s }).eq("id", enr.id); };

    if (!key) {
      if (!capable) { await setState("legacy"); return { attestChallenge: null }; }
      return { attestChallenge: await challengeFor(admin, enr) };
    }

    const ts = headers.get("x-mm-ts") ?? "";
    const sig = headers.get("x-mm-sig") ?? "";
    if (ts && sig) {
      const tsNum = Number(ts);
      if (Number.isFinite(tsNum) && verifyCheckinSignature(key.public_key_spki, ts, rawBody, sig)) {
        if (key.last_sig_ts && tsNum <= Number(key.last_sig_ts)) {
          await admin.from("device_keys").update({ sig_fail_count: Number(key.sig_fail_count || 0) + 1 }).eq("id", key.id);
          await recordTamper(admin, enr, "replayed_checkin", { ts: tsNum, last_ts: key.last_sig_ts });
          return { attestChallenge: null };
        }
        await admin.from("device_keys").update({ last_sig_at: new Date().toISOString(), last_sig_ts: tsNum, sig_ok_count: Number(key.sig_ok_count || 0) + 1 }).eq("id", key.id);
        await setState("active");
        return { attestChallenge: null };
      }
      await admin.from("device_keys").update({ sig_fail_count: Number(key.sig_fail_count || 0) + 1 }).eq("id", key.id);
      await setState("bad_signature");
      await recordTamper(admin, enr, "bad_signature", {});
      return { attestChallenge: null };
    }

    // Unsigned check-in from a phone that has a key on record.
    if (phoneKeyState === "lost") {
      // The phone's secure storage no longer has the key: retire it and let the phone make a new one.
      await admin.from("device_keys").update({ status: "replaced", replaced_at: new Date().toISOString() }).eq("id", key.id);
      await setState("lost");
      await recordTamper(admin, enr, "key_lost", {});
      return { attestChallenge: capable ? await challengeFor(admin, { ...enr, attest_challenge: null }) : null };
    }
    if (phoneKeyState === "error") {
      // The secure chip refused to sign this time (busy / temporary). Counted, not alerted.
      await admin.from("device_keys").update({ sig_fail_count: Number(key.sig_fail_count || 0) + 1 }).eq("id", key.id);
      return { attestChallenge: null };
    }
    await setState("unsigned");
    await recordTamper(admin, enr, "unsigned_checkin", { app_key_state: phoneKeyState });
    return { attestChallenge: null };
  } catch (e) {
    console.warn("[device-keys] check skipped:", (e as Error).message);
    return { attestChallenge: null };
  }
}
