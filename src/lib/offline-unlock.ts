import "server-only";
import { createHmac } from "crypto";

// OFFLINE UNLOCK CODE — works on a locked phone with NO internet.
//
// Both sides already share a secret without any extra sync: the phone holds its device token and
// the server stores sha256(device token). The phone hashes its own token to get the same value.
// The code is a 6-digit HMAC (like an authenticator app) over the phone's enrollment id and a
// 5-minute time step. The phone accepts codes from the last 30 minutes (+5 min clock slack),
// never accepts the same or an older step twice, and slows down repeated wrong guesses.
//
// Keep in sync with OfflineUnlock.kt in the Android app.
export const OFFLINE_STEP_SECONDS = 300;
export const OFFLINE_VALID_MINUTES = 30;
export const OFFLINE_MIN_APP_VERSION = "1.4.0";

export function offlineStep(atMs = Date.now()) {
  return Math.floor(atMs / 1000 / OFFLINE_STEP_SECONDS);
}

export function offlineUnlockCode(deviceTokenHash: string, enrollmentId: string, step = offlineStep()) {
  const mac = createHmac("sha256", Buffer.from(deviceTokenHash, "utf8")).update(`mm-unlock:${enrollmentId}:${step}`).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | ((mac[off + 1] & 0xff) << 16) | ((mac[off + 2] & 0xff) << 8) | (mac[off + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

/** "1.3.0" < "1.4.0" — true when the installed app can check offline codes. */
export function supportsOfflineCode(appVersion: string | null | undefined) {
  if (!appVersion) return false;
  const a = appVersion.split(/[^0-9]+/).filter(Boolean).map(Number);
  const b = OFFLINE_MIN_APP_VERSION.split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = a[i] ?? 0, y = b[i] ?? 0; if (x !== y) return x > y; }
  return true;
}
