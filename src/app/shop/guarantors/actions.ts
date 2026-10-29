"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
export type ActionState = { error?: string; success?: string };
export async function createGuarantor(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) return { error: "Not authorized" };
  const str = (k: string) => { const v = String(fd.get(k) || "").trim(); return v || null; };
  const full_name = str("full_name");
  if (!full_name) return { error: "Guarantor name is required." };
  const supabase = createClient();
  const { error } = await supabase.from("guarantors").insert({
    shop_id: s.profile.shop_id, full_name, national_id: str("national_id"),
    phone: str("phone"), address: str("address"), relationship: str("relationship"), created_by: s.user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/shop/guarantors");
  return { success: `Guarantor ${full_name} added.` };
}
