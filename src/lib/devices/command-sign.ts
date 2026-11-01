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
