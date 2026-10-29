import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { ShopSettingsForm } from "@/components/shops/shop-settings-form";
import { DeviceSetupCard } from "@/components/devices/device-setup-card";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const session = await getSessionProfile();
  const supabase = createClient();
  const { data: shop } = await supabase.from("shops").select("name,phone,address,enroll_secret").eq("id", session?.profile.shop_id ?? "").single();
  return (
    <div className="space-y-6">
      <ShopSettingsForm shop={shop ?? { name: "", phone: null, address: null }} />
      {session?.profile.shop_id && shop?.enroll_secret && (
        <DeviceSetupCard shopId={session.profile.shop_id} secret={shop.enroll_secret} />
      )}
    </div>
  );
}
