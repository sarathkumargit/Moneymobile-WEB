import "server-only";
import os from "os";

// The phone can't use "localhost". When the website is opened as localhost, work out this
// computer's Wi-Fi/LAN address so the phone (QR setup, USB setup) gets a reachable URL.
function lanIPv4(): string | null {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list ?? []) {
      if (n.family !== "IPv4" || n.internal) continue;
      if (/^(169\.254\.|127\.)/.test(n.address)) continue;
      candidates.push({ name, address: n.address });
    }
  }
  const score = (c: { name: string; address: string }) =>
    (/^(en0|wlan|wl|wi-?fi|eth0|en1)/i.test(c.name) ? 0 : 2) + (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(c.address) ? 0 : 1) + (/vmnet|vbox|docker|utun|bridge|veth/i.test(c.name) ? 5 : 0);
  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0]?.address ?? null;
}

/** Base URL the PHONE should use for this server, e.g. http://192.168.8.168:3000 */
export function phoneServerOrigin(req: Request): { origin: string; fromLocalhost: boolean } {
  const url = new URL(req.url);
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (!isLocal) return { origin: url.origin, fromLocalhost: false };
  const ip = lanIPv4();
  return { origin: ip ? `${url.protocol}//${ip}${url.port ? `:${url.port}` : ""}` : url.origin, fromLocalhost: true };
}
