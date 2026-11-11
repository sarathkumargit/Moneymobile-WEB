import "server-only";
import { createHmac } from "crypto";

// OFFLINE RELEASE CODE — frees a phone completely with NO internet (app 1.11.4+).
//
// Same shared secret as the 30-min unlock code (the phone's device token; the server keeps
// sha256(token)), but a different label ("mm-release"), so an unlock code can never release a phone
// and a release code can never be used as an unlock code. 10 digits, 10-minute time steps; the phone
// accepts codes made in the last 2 hours (+10 min clock slack), each step once, and blocks guessing.
//
// Typing it on the phone removes reset protection, every restriction and Device Owner, so the phone
// can be factory reset and set up again. Only the shop owner can make one.
//
// Keep in sync with OfflineRelease.kt in the Android app.
export const RELEASE_STEP_SECONDS = 600;
export const RELEASE_VALID_MINUTES = 120;
export const RELEASE_MIN_APP_VERSION = "1.11.4";

export function releaseStep(atMs = Date.now()) {
  return Math.floor(atMs / 1000 / RELEASE_STEP_SECONDS);
}

export function offlineReleaseCode(deviceTokenHash: string, enrollmentId: string, step = releaseStep()) {
  const mac = createHmac("sha256", Buffer.from(deviceTokenHash, "utf8")).update(`mm-release:${enrollmentId}:${step}`).digest();
  const off = mac[mac.length - 1] & 0x0f;
  let n = BigInt(mac[off] & 0x7f);
  for (let i = 1; i < 8; i++) n = (n << BigInt(8)) | BigInt(mac[off + i]);
  return (n % BigInt(10_000_000_000)).toString().padStart(10, "0");
}

/** "12345 67890" — easier to read out over the phone. */
export function formatReleaseCode(code: string) {
  return `${code.slice(0, 5)} ${code.slice(5)}`;
}
