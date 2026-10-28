"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export type ActionState = { error?: string; success?: string };

export async function createModel(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const str = (k: string) => { const v = String(fd.get(k) || "").trim(); return v || null; };
  const num = (k: string) => { const v = String(fd.get(k) || "").trim(); return v === "" ? null : Number(v); };
  const brand = str("brand"); const model_name = str("model_name");
  if (!brand || !model_name) return { error: "Brand and model name are required." };
  const supabase = createClient();
  const { error } = await supabase.from("phone_models").insert({
    shop_id: s.profile.shop_id, brand, model_name, variant: str("variant"), ram: str("ram"),
    storage: str("storage"), color: str("color"), os: str("os"),
    retail_price: num("retail_price") ?? 0, default_installment_price: num("default_installment_price"),
    default_deposit: num("default_deposit"), stock_qty: num("stock_qty") ?? 0, created_by: s.user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/shop/models"); revalidatePath("/shop/inventory");
  return { success: `${brand} ${model_name} added to catalog.` };
}
