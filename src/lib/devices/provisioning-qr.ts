// QR-code setup ("provisioning") for a MoneyMobile phone.
//
// A new or factory-reset Android phone can be made Device Owner straight from its Welcome screen:
// tap the screen 6 times, scan a QR code, and Android downloads the app, checks it, installs it as
// the device admin and hands it the "admin extras" built below. The app side lives in the Android
// project (provisioning/ProvisioningModeActivity.kt + ProvisioningSetup.kt): it reads shop_id,
// enroll_secret and server_url from those extras, saves them and registers the phone in the
// background, which gives the same result as running the USB setup file.
//
// This module only builds the text that goes inside the QR code. It is pure and has no server-only
// imports, so the browser can use it. The values come from GET /api/setup-kit/config.

/** What GET /api/setup-kit/config returns. `apk` is null when the server has no app file to hand out. */
export type SetupKitConfig = {
  shopId: string;
  shopName: string;
  secret: string;
  /** API address the phone talks to, e.g. https://example.com/api */
  serverUrl: string;
  /** Where the phone downloads the app during setup. */
  apkUrl: string;
  /** True when the website was opened as "localhost" and the address above was swapped for the computer's LAN address. */
  fromLocalhost: boolean;
  /** `checksum` = SHA-256 of the app file, base64url without padding. */
  apk: { size: number; built: string; checksum: string } | null;
};

/** A problem the staff member can act on; the message is written for them. */
export class ProvisioningQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningQrError";
  }
}

// Android's own names (DevicePolicyManager.EXTRA_PROVISIONING_*). Spelling matters: a wrong key is ignored silently.
const EXTRA = {
  adminComponent: "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME",
  downloadLocation: "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION",
  packageChecksum: "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM",
  leaveAllSystemAppsEnabled: "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED",
  adminExtrasBundle: "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE",
} as const;

// Must match the app: applicationId and the <receiver android:name=".admin.DeviceAdminReceiver"> in AndroidManifest.xml.
const APP_PACKAGE = "com.moneymobile.installment";
const ADMIN_COMPONENT = `${APP_PACKAGE}/${APP_PACKAGE}.admin.DeviceAdminReceiver`;

const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, no "=" padding
const UNREACHABLE_HOST = /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Checks the shape of the config response; returns null when it is not what we expect. */
export function parseSetupKitConfig(json: unknown): SetupKitConfig | null {
  if (!isRecord(json)) return null;
  const { shopId, shopName, secret, serverUrl, apkUrl, fromLocalhost, apk } = json;
  if (!isText(shopId) || !isText(secret) || !isText(serverUrl) || !isText(apkUrl) || typeof fromLocalhost !== "boolean") return null;

  let parsedApk: SetupKitConfig["apk"] = null;
  if (apk !== null && apk !== undefined) {
    if (!isRecord(apk) || typeof apk.checksum !== "string" || typeof apk.size !== "number" || typeof apk.built !== "string") return null;
    parsedApk = { checksum: apk.checksum, size: apk.size, built: apk.built };
  }
  return { shopId, shopName: typeof shopName === "string" ? shopName : "", secret, serverUrl, apkUrl, fromLocalhost, apk: parsedApk };
}

function assertPhoneCanReach(label: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProvisioningQrError(`The ${label} is not a valid web address.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProvisioningQrError(`The ${label} must start with http:// or https://.`);
  }
  if (UNREACHABLE_HOST.test(url.hostname)) {
    throw new ProvisioningQrError(
      `The ${label} points at "${url.hostname}", which a phone cannot reach. Open this website using the computer's Wi-Fi address (for example http://192.168.1.20:3000) and try again.`,
    );
  }
}

/** The exact text to encode in the QR code. Compact JSON: every byte costs QR size, and big codes scan worse. */
export function buildProvisioningPayload(cfg: SetupKitConfig): string {
  if (!cfg.apk) {
    throw new ProvisioningQrError(
      "The MoneyMobile app file is not on the server yet. Publish it under Super Admin → App Updates (or add setup-kit/MoneyMobile.apk) and try again.",
    );
  }
  if (!SHA256_BASE64URL.test(cfg.apk.checksum)) {
    throw new ProvisioningQrError("The server returned the app checksum in an unexpected format, so the phone could not verify the download.");
  }
  assertPhoneCanReach("app download address", cfg.apkUrl);
  assertPhoneCanReach("server address", cfg.serverUrl);

  return JSON.stringify({
    [EXTRA.adminComponent]: ADMIN_COMPONENT,
    [EXTRA.downloadLocation]: cfg.apkUrl,
    [EXTRA.packageChecksum]: cfg.apk.checksum,
    // Customers get a normal phone: keep Play Store, dialer, camera and the other pre-installed apps enabled.
    [EXTRA.leaveAllSystemAppsEnabled]: true,
    // Read by ProvisioningSetup.kt, same values the USB setup file passes to the app.
    [EXTRA.adminExtrasBundle]: { shop_id: cfg.shopId, enroll_secret: cfg.secret, server_url: cfg.serverUrl },
  });
}
