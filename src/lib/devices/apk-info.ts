import "server-only";
import { inflateRawSync } from "zlib";

// Reads the package name, version code and version name straight out of an APK file, so the super
// admin never types a version number by hand (a wrong number would make every phone refuse the file).
// An APK is a zip; AndroidManifest.xml inside it is Android's compiled ("binary") XML.
// Returns null when the file is not a readable APK.

export type ApkInfo = { packageName: string; versionCode: number; versionName: string | null };

const ATTR_VERSION_CODE = 0x0101021b; // android:versionCode
const ATTR_VERSION_NAME = 0x0101021c; // android:versionName

export function readApkInfo(buf: Buffer): ApkInfo | null {
  try {
    const manifest = extractZipEntry(buf, "AndroidManifest.xml");
    return manifest ? parseManifest(manifest) : null;
  } catch {
    return null;
  }
}

function extractZipEntry(buf: Buffer, wanted: string): Buffer | null {
  // End of central directory: last 22 bytes + up to 64 KB comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const lName = buf.readUInt16LE(localOffset + 26);
      const lExtra = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lName + lExtra;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function parseManifest(x: Buffer): ApkInfo | null {
  if (x.readUInt16LE(0) !== 0x0003) return null; // RES_XML_TYPE
  let strings: string[] = [];
  let resIds: number[] = [];
  let off = x.readUInt16LE(2);
  while (off + 8 <= x.length) {
    const type = x.readUInt16LE(off);
    const headerSize = x.readUInt16LE(off + 2);
    const size = x.readUInt32LE(off + 4);
    if (size < 8) return null;
    if (type === 0x0001) strings = readStringPool(x, off);
    else if (type === 0x0180) {
      const count = (size - headerSize) / 4;
      resIds = [];
      for (let i = 0; i < count; i++) resIds.push(x.readUInt32LE(off + headerSize + i * 4));
    } else if (type === 0x0102) {
      // First start-element is <manifest>.
      const ext = off + headerSize;
      const nameIdx = x.readUInt32LE(ext + 4);
      if (strings[nameIdx] !== "manifest") return null;
      const attrStart = x.readUInt16LE(ext + 8);
      const attrSize = x.readUInt16LE(ext + 10);
      const attrCount = x.readUInt16LE(ext + 12);
      let packageName: string | null = null;
      let versionCode: number | null = null;
      let versionName: string | null = null;
      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize;
        const nIdx = x.readUInt32LE(a + 4);
        const raw = x.readUInt32LE(a + 8);
        const dataType = x.readUInt8(a + 15);
        const data = x.readUInt32LE(a + 16);
        const attrName = strings[nIdx];
        const resId = resIds[nIdx];
        const str = raw !== 0xffffffff ? strings[raw] : dataType === 0x03 ? strings[data] : undefined;
        if (attrName === "package") packageName = str ?? null;
        else if (resId === ATTR_VERSION_CODE || attrName === "versionCode") versionCode = dataType >= 0x10 && dataType <= 0x1f ? data : str ? parseInt(str, 10) : null;
        else if (resId === ATTR_VERSION_NAME || attrName === "versionName") versionName = str ?? null;
      }
      if (!packageName || versionCode === null || !Number.isFinite(versionCode)) return null;
      return { packageName, versionCode, versionName };
    }
    off += size;
  }
  return null;
}

function readStringPool(x: Buffer, off: number): string[] {
  const count = x.readUInt32LE(off + 8);
  const flags = x.readUInt32LE(off + 16);
  const stringsStart = x.readUInt32LE(off + 20);
  const utf8 = (flags & 0x100) !== 0;
  const offsetsAt = off + x.readUInt16LE(off + 2);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = off + stringsStart + x.readUInt32LE(offsetsAt + i * 4);
    if (utf8) {
      // char length (1-2 bytes), then byte length (1-2 bytes)
      p += (x[p] & 0x80) ? 2 : 1;
      let len = x[p];
      if (len & 0x80) { len = ((len & 0x7f) << 8) | x[p + 1]; p += 2; } else p += 1;
      out.push(x.toString("utf8", p, p + len));
    } else {
      let len = x.readUInt16LE(p);
      if (len & 0x8000) { len = ((len & 0x7fff) << 16) | x.readUInt16LE(p + 2); p += 4; } else p += 2;
      out.push(x.toString("utf16le", p, p + len * 2));
    }
  }
  return out;
}
