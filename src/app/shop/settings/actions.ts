"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export type ActionState = { error?: string; success?: string };
export async function updateShop(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const name = String(fd.get("name") || "").trim();
  if (!name) return { error: "Shop name is required." };
  const admin = createAdminClient();
  const { error } = await admin.from("shops").update({
    name, phone: String(fd.get("phone") || "").trim() || null, address: String(fd.get("address") || "").trim() || null,
  }).eq("id", s.profile.shop_id);
  if (error) return { error: error.message };
  revalidatePath("/shop/settings"); revalidatePath("/shop");
  return { success: "Shop details updated." };
}

// Reset protection: the shop's own Google account ID(s). Phones pick the change up on their next check-in.
export async function updateResetProtection(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const { parseAccountIds } = await import("@/lib/devices/reset-protection");
  const parsed = parseAccountIds(String(fd.get("frp_account_ids") || ""));
  if (parsed.error) return { error: parsed.error };
  const admin = createAdminClient();
  const { error } = await admin.from("shops").update({ frp_account_ids: parsed.ids.length ? parsed.ids.join(",") : null }).eq("id", s.profile.shop_id);
  if (error) return { error: /frp_account_ids/.test(error.message) ? "Ask the system owner to run migration 0021_reset_protection.sql first." : error.message };
  revalidatePath("/shop/settings"); revalidatePath("/shop/device-management");
  return {
    success: parsed.ids.length
      ? "Saved. Each phone turns reset protection on at its next check-in (within a few minutes if it's online)."
      : "Removed. Phones turn reset protection off at their next check-in — a button reset will then remove MoneyMobile.",
  };
}
