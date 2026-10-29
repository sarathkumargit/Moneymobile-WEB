import "server-only";
import { createSign, createHmac } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// Sends a push to one phone via Firebase Cloud Messaging (HTTP v1). Used to reach a phone even when
// it can't reach our website — Google delivers it. A LOCK/UNLOCK push is signed with the same secret
// as the offline unlock code (HMAC key = the phone's device_token_hash), so a forged push is ignored.
// Keep in sync with util/FcmCommand.kt on the phone.
//
// Credential: the Firebase service-account JSON. Put it at <project>/firebase-service-account.json
// (git-ignored), or set FIREBASE_SERVICE_ACCOUNT (inline JSON) / FIREBASE_SERVICE_ACCOUNT_PATH.

type ServiceAccount = { client_email: string; private_key: string; project_id: string };
let saCache: ServiceAccount | null | undefined;
let tokenCache: { token: string; expMs: number } | null = null;

async function loadServiceAccount(): Promise<ServiceAccount | null> {
  if (saCache !== undefined) return saCache;
  try {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    const raw = inline ?? (await fs.readFile(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "firebase-service-account.json"), "utf8"));
    const j = JSON.parse(raw);
    saCache = j.client_email && j.private_key && j.project_id
      ? { client_email: j.client_email, private_key: j.private_key as string, project_id: j.project_id } : null;
  } catch { saCache = null; }
  return saCache;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.expMs > Date.now() + 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("FCM auth failed");
  tokenCache = { token: j.access_token, expMs: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

export type FcmResult = { ok: boolean; reason?: string };

export async function sendFcmCommand(opts: {
  fcmToken: string | null | undefined;
  deviceId: string;          // the enrollment id the phone identifies itself by
  deviceTokenHash: string | null | undefined;
  command: "LOCK" | "UNLOCK" | "SYNC";
  cmdId: string;
}): Promise<FcmResult> {
  if (!opts.fcmToken) return { ok: false, reason: "phone has no push token yet" };
  const sa = await loadServiceAccount();
  if (!sa) return { ok: false, reason: "FCM not configured (firebase-service-account.json missing)" };

  const ts = Math.floor(Date.now() / 1000);
  const data: Record<string, string> = { command: opts.command, ts: String(ts), cmd_id: opts.cmdId };
  if (opts.command !== "SYNC") {
    if (!opts.deviceTokenHash) return { ok: false, reason: "phone not fully registered" };
    data.sig = createHmac("sha256", opts.deviceTokenHash)
      .update(`fcm:${opts.deviceId}:${opts.command}:${ts}:${opts.cmdId}`).digest("hex");
  }
  try {
    const token = await accessToken(sa);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token: opts.fcmToken, data, android: { priority: "high" } } }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[fcm] send failed", res.status, t.slice(0, 300));
      // 404 / UNREGISTERED = the token is dead (app reinstalled / phone wiped).
      return { ok: false, reason: res.status === 404 ? "push token expired" : `send error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[fcm] error", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

export function fcmConfigured(): Promise<boolean> {
  return loadServiceAccount().then((sa) => !!sa);
}
