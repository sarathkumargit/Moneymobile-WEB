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
