"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/shared/flash";
import { redirect } from "next/navigation";
import { uploadDoc } from "@/lib/shared/storage";

export type ActionState = { error?: string; success?: string };

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session || !session.profile.shop_id || !["shop_admin", "employee"].includes(session.profile.role)) {
    return { error: "Not authorized" };
  }

  const full_name = String(formData.get("full_name") || "").trim();
  const national_id = String(formData.get("national_id") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const address = String(formData.get("address") || "").trim();

  if (!full_name) return { error: "Customer name is required." };

  // Optional ID-card photos (front + back).
  const nic_doc_url = await uploadDoc(formData.get("nic_photo_front"), "customers");
  const nic_doc_back_url = await uploadDoc(formData.get("nic_photo_back"), "customers");

  // RLS enforces shop scoping; we set shop_id + creator explicitly.
  const supabase = createClient();
  const { data: cust, error } = await supabase.from("customers").insert({
    shop_id: session.profile.shop_id,
    full_name,
    national_id: national_id || null,
    phone: phone || null,
    email: email || null,
    address: address || null,
    nic_doc_url,
    nic_doc_back_url,
    created_by: session.user.id,
    assigned_employee_id: session.profile.role === "employee" ? session.user.id : null,
  }).select("id").single();
  if (error || !cust) return { error: error?.message || "Could not register customer." };

  // Optional guarantor captured with the customer, linked to them.
  const gName = String(formData.get("guarantor_full_name") || "").trim();
  if (gName) {
    const gStr = (k: string) => { const v = String(formData.get(k) || "").trim(); return v || null; };
    const g_front = await uploadDoc(formData.get("guarantor_nic_front"), "guarantors");
    const g_back = await uploadDoc(formData.get("guarantor_nic_back"), "guarantors");
    await supabase.from("guarantors").insert({
      shop_id: session.profile.shop_id, full_name: gName, national_id: gStr("guarantor_national_id"),
      phone: gStr("guarantor_phone"), email: gStr("guarantor_email"), address: gStr("guarantor_address"),
      relationship: gStr("guarantor_relationship"), nic_doc_url: g_front, nic_doc_back_url: g_back,
      customer_id: cust.id, created_by: session.user.id,
    });
  }

  revalidatePath("/shop/customers");
  revalidatePath("/employee/customers");
  revalidatePath("/employee");
  revalidatePath("/shop");
  return { success: `Customer ${full_name} registered.` };
}

export async function assignCustomer(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return;
  const customer_id = String(fd.get("customer_id") || "").trim();
  const employee_id = String(fd.get("employee_id") || "").trim() || null;
  if (!customer_id) return;
  const supabase = createClient();
  await supabase.from("customers").update({ assigned_employee_id: employee_id }).eq("id", customer_id);
  await supabase.from("audit_logs").insert({
    shop_id: s.profile.shop_id, actor_id: s.user.id, action: "assign_customer",
    entity: "customers", entity_id: customer_id, details: { new_employee: employee_id },
  });
  setFlash("Customer assignment updated.");
  revalidatePath("/shop/customers");
  revalidatePath("/employee/customers");
  revalidatePath("/employee");
}

// Shop admin: edit a customer's details.
export async function updateCustomer(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const id = String(fd.get("customer_id") || "").trim();
  const full_name = String(fd.get("full_name") || "").trim();
  if (!id) return { error: "Missing customer." };
  if (!full_name) return { error: "Customer name is required." };
  const str = (k: string) => { const v = String(fd.get(k) || "").trim(); return v || null; };
  const supabase = createClient();
  const { error } = await supabase.from("customers").update({
    full_name, national_id: str("national_id"), phone: str("phone"), email: str("email"), address: str("address"),
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/shop/customers/${id}`); revalidatePath(`/employee/customers/${id}`); revalidatePath("/shop/customers");
  return { success: "Customer details updated." };
}

// Shop admin: delete a customer — blocked while they still have agreements.
export async function deleteCustomer(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const id = String(fd.get("customer_id") || "").trim();
  if (!id) return { error: "Missing customer." };
  const supabase = createClient();
  const { count } = await supabase.from("installment_agreements").select("id", { count: "exact", head: true }).eq("customer_id", id);
  if (count && count > 0) return { error: "Can't delete — this customer has installment agreements. Release or cancel them first." };
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "delete_customer", entity: "customers", entity_id: id, details: {} });
  revalidatePath("/shop/customers"); revalidatePath("/employee/customers");
  redirect("/shop/customers");
}
