import "server-only";

// Per-shop reset protection (Android "Factory Reset Protection", Android 11+).
// Each shop stores its own Google account ID(s) (shops.frp_account_ids, migration 0021). Every phone of
// that shop holds them; after ANY factory reset — including the Power + Volume recovery menu, which no app
// can block — the phone only finishes setup after signing in with one of these accounts.
// On Release the phone clears them (DevicePolicyController.releaseFully), so a paid-off phone resets normally.
//
// FRP_ACCOUNT_IDS (Vercel env, optional) = platform backup account(s) added to EVERY shop's phones.
// Leave it empty unless you want to be able to unlock any shop's reset phones yourself.

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

/** First app build that reports its reset-protection state (1.10.1). */
export const FRP_REPORT_MIN_CODE = 20;
const MAX_IDS = 3;

/** Turns "123, 456" into ["123","456"]; null + error message when something is not a Google account ID. */
export function parseAccountIds(input: string): { ids: string[]; error?: string } {
  const parts = input.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.replace(/^people\//i, ""));
  if (parts.length > MAX_IDS) return { ids: [], error: `Enter at most ${MAX_IDS} account IDs.` };
  for (const p of parts) {
    if (p.includes("@")) return { ids: [], error: "Enter the account's number (ID), not the email address. See the steps below." };
    if (!/^\d{10,30}$/.test(p)) return { ids: [], error: `"${p}" is not a Google account ID. It should be a long number (about 21 digits).` };
  }
  return { ids: Array.from(new Set(parts)) };
}

export function platformIds(): string[] {
  return parseAccountIds(process.env.FRP_ACCOUNT_IDS || "").ids;
}

/** The account IDs a phone of this shop must hold: the shop's own + the optional platform backup. Sorted. */
export async function idsForShop(admin: Admin, shopId: string | null | undefined): Promise<string[]> {
  let shopIds: string[] = [];
  if (shopId) {
    const { data, error } = await admin.from("shops").select("frp_account_ids").eq("id", shopId).maybeSingle();
    if (error) {
      // Migration 0021 not run yet: behave exactly as before (platform list only).
      // Any other error: throw, so the heartbeat leaves the field out and the phone keeps its protection.
      if (!/frp_account_ids/.test(error.message ?? "")) throw new Error(error.message);
    } else {
      shopIds = parseAccountIds((data as { frp_account_ids?: string | null } | null)?.frp_account_ids ?? "").ids;
    }
  }
  return Array.from(new Set([...shopIds, ...platformIds()])).sort();
}

export type FrpEnr = {
  status?: string | null; last_sync?: string | null; app_version_code?: number | null;
  frp_state?: string | null; frp_accounts?: string | null; frp_checked_at?: string | null;
};
export type FrpBadge = { label: string; variant: "success" | "warning" | "danger" | "neutral"; detail: string; protectedNow: boolean };

/** Plain-language reset-protection status for one phone, as staff should see it. */
export function frpBadge(e: FrpEnr, shopIds: string[]): FrpBadge {
  if (e.status === "released") return { label: "Reset protection removed (released)", variant: "neutral", protectedNow: false, detail: "Fully paid and released. The customer can reset this phone normally." };
  if (!e.last_sync) return { label: "Reset protection: not yet", variant: "warning", protectedNow: false, detail: "The phone hasn't checked in yet. It receives the protection on its first check-in." };
  if (e.app_version_code == null || e.app_version_code < FRP_REPORT_MIN_CODE) {
    return { label: "Reset protection: unknown", variant: "neutral", protectedNow: false, detail: "This phone's app is older than 1.10.1, so it can't report whether the protection is on. Update the app to see it." };
  }
  const state = e.frp_state ?? "";
  const held = (e.frp_accounts ?? "").split(",").filter(Boolean).sort().join(",");
  if (state === "unsupported") return { label: "Reset protection: not supported", variant: "danger", protectedNow: false, detail: "This phone (Android 10 or older, or this model) can't hold reset protection. A factory reset from the buttons removes MoneyMobile. Ask for a higher down payment or a guarantor." };
  if (state === "failed") return { label: "Reset protection: failed", variant: "danger", protectedNow: false, detail: "The phone could not turn the protection on. It retries on every check-in." };
  if (state === "on" && held) {
    if (shopIds.length && held !== shopIds.join(",")) return { label: "Reset protection: updating", variant: "warning", protectedNow: true, detail: "Protected with the previous account list; the new one arrives on the next check-in." };
    return { label: "Reset protection: on", variant: "success", protectedNow: true, detail: "After any factory reset the phone asks for the shop's Google account." };
  }
  if (!shopIds.length) return { label: "Reset protection: off", variant: "danger", protectedNow: false, detail: "Add the shop's Google account ID in Shop Settings. Until then a factory reset from the buttons removes MoneyMobile." };
  return { label: "Reset protection: turning on", variant: "warning", protectedNow: false, detail: "The account was added; the phone turns the protection on at its next check-in." };
}
