import "server-only";
import { X509Certificate, createHash } from "crypto";

// Android key attestation (anti-unlock plan, Phase 2).
//
// At registration the app creates a signing key inside the phone's secure chip (TEE or StrongBox) with a
// one-time challenge from the server. Android returns a certificate chain for that key; the first
// certificate carries the "key description" extension (OID 1.3.6.1.4.1.11129.2.1.17) written by the secure
// chip itself: security level, the challenge, the boot state (bootloader locked? firmware verified?),
// OS/patch levels and the app that asked for the key.
//
// This file checks the chain up to Google's attestation roots and reads that extension with a small DER
// reader (no extra npm packages). Reference: developer.android.com/privacy-and-security/security-key-attestation
// and the AOSP KeyMint attestation schema.
//
// Trust anchors: Google's attestation root public keys. The RSA key is shared by every Google RSA root
// (2016, 2019, 2021, 2022); the ECDSA P-384 root signs chains from 1 Feb 2026.

const GOOGLE_ROOT_SPKI_B64 = [
  // RSA 4096 (all Google RSA attestation roots use this key)
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAr7bHgiuxpwHsK7Qui8xUFmOr75gvMsd/dTEDDJdSSxtf6An7xyqpRR90PL2abxM1dEqlXnf2tqw1Ne4Xwl5jlRfdnJLmN0pTy/4lj4/7tv0Sk3iiKkypnEUtR6WfMgH0QZfKHM1+di+y9TFRtv6y//0rb+T+W8a9nsNL/ggjnar86461qO0rOs2cXjp3kOG1FEJ5MVmFmBGtnrKpa73XpXyTqRxB/M0n1n/W9nGqC4FSYa04T6N5RIZGBN2z2MT5IKGbFlbC8UrW0DxW7AYImQQcHtGl/m00QLVWutHQoVJYnFPlXTcHYvASLu+RhhsbDmxMgJJ0mcDpvsC4PjvB+TxywElgS70vE0XmLD+OJtvsBslHZvPBKCOdT0MS+tgSOIfga+z1Z1g7+DVagf7quvmag8jfPioyKvxnK/EgsTUVi2ghzq8wm27ud/mIM7AY2qEORR8Go3TVB4HzWQgpZrt3i5MIlCaY504LzSRiigHCzAPlHws+W0rB5N+er5/2pJKnfBSDiCiFAVtCLOZ7gLiMm0jhO2B6tUXHI/+MRPjy02i59lINMRRev56GKtcd9qO/0kUJWdZTdA2XoS82ixPvZtXQpUpuL12ab+9EaDK8Z4RHJYYfCT3Q5vNAXaiWQ+8PTWm2QgBR/bkwSWc+NpUFgNPN9PvQi8WEg5UmAGMCAwEAAQ==",
  // ECDSA P-384 "Key Attestation CA1" (from 2026-02-01)
  "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEI9ojcU7fPlsFCjxy6IRqzgeOoK0b+YsV9FPQywiyw8EQRTkJ9u3qwfnI4DGoSLlBqClTXJfgfCcZvs60FikNMHnu4fkRzObfgDkU2KNXezT9/RQ+XvNslxPHrHCowhGr",
];

// ───────────────────────── minimal DER reader ─────────────────────────

export type Der = { cls: number; constructed: boolean; tag: number; value: Buffer; children: Der[] | null; raw: Buffer };

/** Reads one DER element at `pos`. Supports high tag numbers (KeyMint tags go up to 700+). */
function readOne(buf: Buffer, pos: number): { node: Der; next: number } {
  const start = pos;
  if (pos >= buf.length) throw new Error("DER: unexpected end");
  const b0 = buf[pos++];
  const cls = b0 >> 6;
  const constructed = (b0 & 0x20) !== 0;
  let tag = b0 & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b: number;
    let guard = 0;
    do {
      if (pos >= buf.length || ++guard > 4) throw new Error("DER: bad tag");
      b = buf[pos++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  if (pos >= buf.length) throw new Error("DER: no length");
  let len = buf[pos++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("DER: unsupported length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++];
  }
  const end = pos + len;
  if (end > buf.length) throw new Error("DER: length past end");
  const value = buf.subarray(pos, end);
  let children: Der[] | null = null;
  if (constructed) {
    children = [];
    let p = 0;
    while (p < value.length) { const r = readOne(value, p); children.push(r.node); p = r.next; }
  }
  return { node: { cls, constructed, tag, value, children, raw: buf.subarray(start, end) }, next: end };
}

export function parseDer(buf: Buffer): Der {
  const r = readOne(buf, 0);
  return r.node;
}

function derInt(n: Der | undefined): number | null {
  if (!n || n.cls !== 0 || (n.tag !== 2 && n.tag !== 10) || !n.value.length) return null; // INTEGER / ENUMERATED
  let v = BigInt(0);
  for (const byte of n.value) v = (v << BigInt(8)) | BigInt(byte);
  if (n.value[0] & 0x80) v -= BigInt(1) << BigInt(8 * n.value.length); // two's complement
  return Number(v);
}

function oidToString(v: Buffer): string {
  const parts: number[] = [Math.floor(v[0] / 40), v[0] % 40];
  let acc = 0;
  for (let i = 1; i < v.length; i++) { acc = acc * 128 + (v[i] & 0x7f); if (!(v[i] & 0x80)) { parts.push(acc); acc = 0; } }
  return parts.join(".");
}

const KEY_DESCRIPTION_OID = "1.3.6.1.4.1.11129.2.1.17";

/** The key-description extension value (an OCTET STRING's content), or null. */
function keyDescriptionFromCert(certDer: Buffer): Buffer | null {
  const cert = parseDer(certDer);
  const tbs = cert.children?.[0];
  const extWrapper = tbs?.children?.find((c) => c.cls === 2 && c.tag === 3); // [3] EXPLICIT Extensions
  const exts = extWrapper?.children?.[0]?.children ?? [];
  for (const ext of exts) {
    const oid = ext.children?.[0];
    if (!oid || oid.tag !== 6) continue;
    if (oidToString(oid.value) !== KEY_DESCRIPTION_OID) continue;
    const octet = ext.children?.[ext.children.length - 1];
    return octet && octet.tag === 4 ? octet.value : null;
  }
  return null;
}

// ───────────────────────── key description ─────────────────────────

export type SecurityLevel = "software" | "tee" | "strongbox" | "unknown";
export type BootState = "verified" | "self_signed" | "unverified" | "failed" | "unknown";
const LEVELS: SecurityLevel[] = ["software", "tee", "strongbox"];
const BOOT: BootState[] = ["verified", "self_signed", "unverified", "failed"];

export type KeyDescription = {
  attestationVersion: number | null;
  attestationSecurityLevel: SecurityLevel;
  keymasterVersion: number | null;
  keymasterSecurityLevel: SecurityLevel;
  challenge: Buffer;
  deviceLocked: boolean | null;
  verifiedBootState: BootState;
  osVersion: number | null;
  osPatchLevel: number | null;      // YYYYMM
  vendorPatchLevel: number | null;  // YYYYMMDD
  bootPatchLevel: number | null;    // YYYYMMDD
  packageNames: string[];
  signatureDigestsHex: string[];
};

/** Children of an AuthorizationList, keyed by tag number ([n] EXPLICIT → inner value). */
function authList(seq: Der | undefined): Map<number, Der> {
  const m = new Map<number, Der>();
  for (const c of seq?.children ?? []) if (c.cls === 2 && c.children?.[0]) m.set(c.tag, c.children[0]);
  return m;
}

export function parseKeyDescription(ext: Buffer): KeyDescription {
  const kd = parseDer(ext);
  const f = kd.children ?? [];
  if (f.length < 8) throw new Error("key description: too few fields");
  const sw = authList(f[6]);
  const hw = authList(f[7]);
  const pick = (tag: number) => hw.get(tag) ?? sw.get(tag);

  let deviceLocked: boolean | null = null;
  let verifiedBootState: BootState = "unknown";
  const rot = hw.get(704) ?? sw.get(704); // rootOfTrust
  if (rot?.children) {
    const locked = rot.children[1];
    if (locked && locked.tag === 1 && locked.value.length === 1) deviceLocked = locked.value[0] !== 0;
    const st = derInt(rot.children[2]);
    if (st !== null) verifiedBootState = BOOT[st] ?? "unknown";
  }

  // attestationApplicationId [709]: OCTET STRING holding DER { SET OF {name, version}, SET OF digest }
  const packageNames: string[] = [];
  const signatureDigestsHex: string[] = [];
  const appId = sw.get(709) ?? hw.get(709);
  if (appId && appId.tag === 4) {
    try {
      const inner = parseDer(appId.value);
      for (const info of inner.children?.[0]?.children ?? []) {
        const name = info.children?.[0];
        if (name && name.tag === 4) packageNames.push(name.value.toString("utf8"));
      }
      for (const d of inner.children?.[1]?.children ?? []) if (d.tag === 4) signatureDigestsHex.push(d.value.toString("hex"));
    } catch { /* malformed app id: leave empty */ }
  }

  const lvl = (n: Der | undefined): SecurityLevel => { const v = derInt(n); return v === null ? "unknown" : LEVELS[v] ?? "unknown"; };
  return {
    attestationVersion: derInt(f[0]),
    attestationSecurityLevel: lvl(f[1]),
    keymasterVersion: derInt(f[2]),
    keymasterSecurityLevel: lvl(f[3]),
    challenge: Buffer.from(f[4].value),
    deviceLocked,
    verifiedBootState,
    osVersion: derInt(pick(705)),
    osPatchLevel: derInt(pick(706)),
    vendorPatchLevel: derInt(pick(718)),
    bootPatchLevel: derInt(pick(719)),
    packageNames,
    signatureDigestsHex,
  };
}

// ───────────────────────── chain verification ─────────────────────────

export type AttestationCheck = {
  /** google = chain ends at a Google root; untrusted_root = valid chain, unknown root; invalid = broken chain/extension */
  trust: "google" | "untrusted_root" | "invalid";
  challengeOk: boolean;
  error: string | null;
  publicKeySpkiB64: string | null;
  keyFingerprint: string | null; // sha256 hex of the public key (SPKI DER)
  leafSerialHex: string | null;
  chainSerialsHex: string[];
  description: KeyDescription | null;
  packageOk: boolean | null;
};

/**
 * Verifies an attestation chain (leaf first, base64 DER) against the expected challenge.
 * Never throws: any problem comes back as trust "invalid" with an error message.
 */
export function verifyAttestationChain(chainB64: string[], expectedChallenge: Buffer, expectedPackage: string): AttestationCheck {
  const out: AttestationCheck = { trust: "invalid", challengeOk: false, error: null, publicKeySpkiB64: null, keyFingerprint: null, leafSerialHex: null, chainSerialsHex: [], description: null, packageOk: null };
  try {
    if (!Array.isArray(chainB64) || chainB64.length < 1 || chainB64.length > 10) throw new Error("chain must have 1-10 certificates");
    const ders = chainB64.map((c) => Buffer.from(String(c), "base64"));
    const certs = ders.map((d) => new X509Certificate(d));
    const leafSpki = certs[0].publicKey.export({ type: "spki", format: "der" }) as Buffer;
    out.publicKeySpkiB64 = leafSpki.toString("base64");
    out.keyFingerprint = createHash("sha256").update(leafSpki).digest("hex");
    out.chainSerialsHex = certs.map((c) => c.serialNumber.toLowerCase().replace(/^0+(?=.)/, ""));
    out.leafSerialHex = out.chainSerialsHex[0];

    // Each certificate must be signed by the next one.
    for (let i = 0; i < certs.length - 1; i++) {
      if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error(`certificate ${i} is not signed by certificate ${i + 1}`);
    }
    const root = certs[certs.length - 1];
    const rootSpki = (root.publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
    const rootSelfSigned = root.verify(root.publicKey);

    const ext = keyDescriptionFromCert(ders[0]);
    if (!ext) throw new Error("no key description extension on the first certificate");
    const kd = parseKeyDescription(ext);
    out.description = kd;
    out.challengeOk = expectedChallenge.length > 0 && kd.challenge.equals(expectedChallenge);
    out.packageOk = kd.packageNames.length ? kd.packageNames.includes(expectedPackage) : null;
    out.trust = rootSelfSigned && GOOGLE_ROOT_SPKI_B64.includes(rootSpki) ? "google" : "untrusted_root";
    if (out.trust !== "google") out.error = "chain does not end at a Google attestation root";
  } catch (e) {
    out.trust = "invalid";
    out.error = (e as Error).message.slice(0, 200);
  }
  return out;
}

// ───────────────────────── revocation (Google status list) ─────────────────────────

let revocationCache: { at: number; serials: Set<string> } | null = null;

/**
 * Serial numbers Google has revoked (leaked or compromised attestation keys). Cached for an hour.
 * Returns null when the list can't be fetched — callers then skip the check instead of failing.
 */
export async function revokedSerials(): Promise<Set<string> | null> {
  if (revocationCache && Date.now() - revocationCache.at < 3600_000) return revocationCache.serials;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch("https://android.googleapis.com/attestation/status", { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return revocationCache?.serials ?? null;
    const j = (await res.json()) as { entries?: Record<string, unknown> };
    const serials = new Set(Object.keys(j.entries ?? {}).map((s) => s.toLowerCase().replace(/^0+(?=.)/, "")));
    revocationCache = { at: Date.now(), serials };
    return serials;
  } catch {
    return revocationCache?.serials ?? null;
  }
}
