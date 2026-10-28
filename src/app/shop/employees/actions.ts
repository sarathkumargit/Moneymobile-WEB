"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";

export type ActionState = { error?: string; success?: string };

export async function createEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "shop_admin" || !session.profile.shop_id) {
    return { error: "Not authorized" };
  }

  const fullName = String(formData.get("full_name") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!fullName || !email || !password) return { error: "Name, email and password are required." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const admin = createAdminClient();
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username: username || null, role: "employee" },
  });
  if (userErr || !created?.user) return { error: userErr?.message || "Could not create the employee account." };

  const { error: profErr } = await admin
    .from("profiles")
    .update({ shop_id: session.profile.shop_id, role: "employee", full_name: fullName, username: username || null })
    .eq("id", created.user.id);
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profErr.message };
  }

  await admin.from("audit_logs").insert({
    shop_id: session.profile.shop_id,
    actor_id: session.user.id,
    action: "create_employee",
    entity: "profiles",
    entity_id: created.user.id,
    details: { email, username: username || null },
  });

  revalidatePath("/shop/employees");
  return { success: `Employee ${email} created — they can sign in on the same login page.` };
}

async function guardEmployee(shopId: string, id: string) {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("profiles").select("shop_id,role").eq("id", id).maybeSingle();
  return emp && emp.shop_id === shopId && emp.role === "employee" ? admin : null;
}

// Shop admin: edit an employee's name / username.
export async function updateEmployee(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const id = String(fd.get("employee_id") || "").trim();
  const full_name = String(fd.get("full_name") || "").trim();
  const username = String(fd.get("username") || "").trim() || null;
  if (!id || !full_name) return { error: "Name is required." };
  const admin = await guardEmployee(s.profile.shop_id, id);
  if (!admin) return { error: "Employee not found." };
  const { error } = await admin.from("profiles").update({ full_name, username }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/shop/employees");
  return { success: "Employee updated." };
}

// Shop admin: enable / disable an employee's login.
export async function setEmployeeActive(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return;
  const id = String(fd.get("employee_id") || "").trim();
  const active = String(fd.get("active") || "") === "true";
  if (!id) return;
  const admin = await guardEmployee(s.profile.shop_id, id);
  if (!admin) return;
  await admin.from("profiles").update({ status: active ? "active" : "disabled" }).eq("id", id);
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: active ? "activate_employee" : "deactivate_employee", entity: "profiles", entity_id: id, details: {} });
  setFlash(active ? "Employee activated." : "Employee deactivated.");
  revalidatePath("/shop/employees");
}

// Shop admin: permanently delete an employee account. Works only for accounts with no
// records attached (the database blocks deleting anyone who has created customers,
// devices or payments) — in that case, deactivate instead.
export async function deleteEmployee(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "shop_admin" || !s.profile.shop_id) return { error: "Not authorized" };
  const id = String(fd.get("employee_id") || "").trim();
  if (!id) return { error: "Missing employee." };
  const admin = await guardEmployee(s.profile.shop_id, id);
  if (!admin) return { error: "Employee not found." };
  // Release device / customer assignments that point at this employee first.
  await admin.from("devices").update({ assigned_employee_id: null }).eq("assigned_employee_id", id);
  await admin.from("customers").update({ assigned_employee_id: null }).eq("assigned_employee_id", id);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: "This employee has records in the system, so they can't be deleted. Deactivate them instead." };
  revalidatePath("/shop/employees"); revalidatePath("/shop/devices"); revalidatePath("/shop/customers");
  return { success: "Employee deleted." };
}
