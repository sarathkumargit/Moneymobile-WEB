import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/auth";
import { ShopSettingsForm } from "@/components/shops/shop-settings-form";
import { ResetProtectionForm } from "@/components/shops/reset-protection-form";
import { DeviceSetupCard } from "@/components/devices/device-setup-card";
import { frpBadge, parseAccountIds, platformIds } from "@/lib/devices/reset-protection";
export const dynamic = "force-dynamic";

type FrpRow = { status: string; last_sync: string | null; app_version_code: number | null; frp_state: string | null; frp_accounts: string | null };

export default async function SettingsPage() {
  const session = await getSessionProfile();
  const supabase = createClient();
  const shopId = session?.profile.shop_id ?? "";
  const [{ data: shop }, frpRes, enrRes] = await Promise.all([
    supabase.from("shops").select("name,phone,address,enroll_secret").eq("id", shopId).single(),
    supabase.from("shops").select("frp_account_ids").eq("id", shopId).maybeSingle(),
    supabase.from("device_enrollments").select("status,last_sync,app_version_code,frp_state,frp_accounts").eq("shop_id", shopId),
  ]);
  // Reset protection needs migration 0021 (and 0020 for app_version_code); hidden until then.
  const frpReady = !frpRes.error && !enrRes.error;
  const current = (frpRes.data as { frp_account_ids?: string | null } | null)?.frp_account_ids ?? "";
  const expected = Array.from(new Set([...parseAccountIds(current).ids, ...platformIds()])).sort();
  const summary = { on: 0, total: 0, unsupported: 0, unknown: 0 };
  for (const e of ((enrRes.data ?? []) as FrpRow[]).filter((r) => r.status !== "released" && r.last_sync)) {
    summary.total++;
    const b = frpBadge(e, expected);
    if (b.protectedNow) summary.on++;
    else if (e.frp_state === "unsupported") summary.unsupported++;
    else if (b.label.endsWith("unknown")) summary.unknown++;
  }
  return (
    <div className="space-y-6">
      <ShopSettingsForm shop={shop ?? { name: "", phone: null, address: null }} />
      {frpReady && session?.profile.role === "shop_admin" && <ResetProtectionForm current={current.split(",").join(", ")} summary={summary} />}
      {session?.profile.shop_id && shop?.enroll_secret && (
        <DeviceSetupCard shopId={session.profile.shop_id} secret={shop.enroll_secret} />
      )}
    </div>
  );
}
