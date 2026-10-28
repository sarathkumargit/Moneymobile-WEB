"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";
export type ActionState = { error?: string; success?: string };
export async function createDevice(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) return { error: "Not authorized" };
  const str = (k: string) => { const v = String(fd.get(k) || "").trim(); return v || null; };
  const num = (k: string) => { const v = String(fd.get(k) || "").trim(); return v === "" ? null : Number(v); };
  const brand = str("brand"); const model = str("model");
  if (!brand || !model) return { error: "Brand and model are required." };
  const supabase = createClient();
  const { error } = await supabase.from("devices").insert({
    shop_id: s.profile.shop_id, model_id: str("model_id"), brand, model, variant: str("variant"),
    imei1: str("imei1"), imei2: str("imei2"), serial_number: str("serial_number"), color: str("color"),
    storage: str("storage"), purchase_cost: num("purchase_cost"), retail_price: num("retail_price"),
    supplier: str("supplier"), status: "in_stock",
    created_by: s.user.id, assigned_employee_id: s.profile.role === "employee" ? s.user.id : null,
  });
  if (error) return { error: error.message.includes("devices_shop_id_imei1") ? "A device with this IMEI already exists." : error.message };
  revalidatePath("/shop/devices"); revalidatePath("/shop/inventory"); revalidatePath("/employee/devices");
  return { success: `Device ${brand} ${model} registered.` };
}

export async function assignDevice(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return;
  const device_id = String(fd.get("device_id") || "").trim();
  const employee_id = String(fd.get("employee_id") || "").trim() || null;
  if (!device_id) return;
  const supabase = createClient();
  const { data: prev } = await supabase.from("devices").select("assigned_employee_id").eq("id", device_id).single();
  await supabase.from("devices").update({ assigned_employee_id: employee_id }).eq("id", device_id);
  await supabase.from("device_assignments").insert({
    shop_id: s.profile.shop_id, device_id, previous_employee: prev?.assigned_employee_id ?? null,
    new_employee: employee_id, performed_by: s.user.id,
  });
  await supabase.from("audit_logs").insert({
    shop_id: s.profile.shop_id, actor_id: s.user.id, action: "assign_device",
    entity: "devices", entity_id: device_id, details: { new_employee: employee_id },
  });
  setFlash("Device assignment updated.");
  revalidatePath("/shop/devices");
  revalidatePath("/employee/devices");
  revalidatePath("/employee");
}
