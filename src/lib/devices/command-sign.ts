import "server-only";
import { createHmac } from "crypto";

// Signs what the server tells a phone (commands and the lock state), so a fake or tampered reply is
// ignored. The key is NOT the phone's device token (the phone sends that to whatever server it talks
// to): it is derived from a secret only this server holds, per phone, and is handed to the phone
// once. Keep in sync with util/CommandSig.kt on the phone.

function secret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/** Per-phone key (hex), or null when the server secret is not configured. */
export function commandKey(enrollmentId: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(`mm-cmdkey:${enrollmentId}`).digest("hex");
}

function mac(keyHex: string, msg: string): string {
  return createHmac("sha256", keyHex).update(msg).digest("hex");
}

export function signCommand(enrollmentId: string, c: { id: string; type: string; issued_at: string }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `cmd|${enrollmentId}|${c.id}|${c.type}|${c.issued_at}`) : null;
}

// Signs the list of following months' lock deadlines (kept separate so older apps still verify the main signature).
export function signLaterDeadlines(enrollmentId: string, a: { id: string; later_lock_at: number[]; server_time: number }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `dl|${enrollmentId}|${a.id}|${a.later_lock_at.join(",")}|${a.server_time}`) : null;
}

export function signAgreement(enrollmentId: string, a: { id: string; locked: boolean; overdue_lock_at: number | null; server_time: number }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `agr|${enrollmentId}|${a.id}|${a.locked ? 1 : 0}|${a.overdue_lock_at ?? 0}|${a.server_time}`) : null;
}

// Signs an app-update offer (which file to install), so the phone only installs what this server chose.
// The phone ALSO checks the file's SHA-256, package name, version and signing certificate before installing.
export function signAppUpdate(enrollmentId: string, u: { request_id: string; version_code: number; sha256: string; size: number }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `upd|${enrollmentId}|${u.request_id}|${u.version_code}|${u.sha256}|${u.size}`) : null;
}

// Signs the reset-protection account list, so a forged reply can never remove (or change) a phone's
// reset protection. Phones from app 1.10.1 apply the list only when this signature checks out.
export function signFrpAccounts(enrollmentId: string, ids: string[]): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `frp|${enrollmentId}|${ids.join(",")}`) : null;
}

// Signs the USB policy (app 1.11.0+): strict = USB debugging + file transfer blocked even while unlocked.
// `until` = end of a staff "USB service" window (epoch ms, 0 = none). A forged reply can't relax it.
export function signUsbPolicy(enrollmentId: string, p: { strict: boolean; until: number }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `usb|${enrollmentId}|${p.strict ? 1 : 0}|${p.until}`) : null;
}

// Signs the customer notice shown after a high-risk tamper alert (app 1.11.0+).
export function signNotice(enrollmentId: string, n: { id: string; text: string }): string | null {
  const k = commandKey(enrollmentId);
  return k ? mac(k, `ntc|${enrollmentId}|${n.id}|${n.text}`) : null;
}
