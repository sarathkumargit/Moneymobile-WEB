"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { error?: string; success?: string };

export async function createShopWithOwner(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "super_admin") {
    return { error: "Not authorized" };
  }

  const shopName = String(formData.get("shop_name") || "").trim();
  const shopPhone = String(formData.get("shop_phone") || "").trim();
  const shopAddress = String(formData.get("shop_address") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!shopName || !fullName || !email || !password) {
    return { error: "Shop name, owner name, email and password are required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const admin = createAdminClient();

  // 1. Create the owner's auth user (email pre-confirmed so they can log in now)
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username: username || null, role: "shop_admin" },
  });
  if (userErr || !created?.user) {
    return { error: userErr?.message || "Could not create the owner account." };
  }
  const ownerId = created.user.id;

  // 2. Create the shop linked to the owner
  const licRaw = String(formData.get("license_limit") || "").trim();
  const licenseLimit = licRaw === "" ? null : Math.floor(Number(licRaw));
  if (licenseLimit !== null && (!Number.isFinite(licenseLimit) || licenseLimit < 0)) {
    await admin.auth.admin.deleteUser(ownerId);
    return { error: "License count must be a number (0 or more), or empty for unlimited." };
  }
  const baseShop = { name: shopName, phone: shopPhone || null, address: shopAddress || null, owner_id: ownerId };
  let { data: shop, error: shopErr } = await admin
    .from("shops").insert({ ...baseShop, license_limit: licenseLimit }).select("id").single();
  if (shopErr && /license_limit/.test(shopErr.message)) {
    // migration 0018 not run yet: create without the limit
    ({ data: shop, error: shopErr } = await admin.from("shops").insert(baseShop).select("id").single());
  }
  if (shopErr || !shop) {
    await admin.auth.admin.deleteUser(ownerId); // roll back the orphaned user
    return { error: shopErr?.message || "Could not create the shop." };
  }

  // 3. Link the owner's profile to the shop (the signup trigger already set
  //    role/full_name/username from metadata; this ensures shop_id is set)
  const { error: profErr } = await admin
    .from("profiles")
    .update({
      shop_id: shop.id,
      role: "shop_admin",
      full_name: fullName,
      username: username || null,
    })
    .eq("id", ownerId);
  if (profErr) {
    return { error: `Shop created, but linking the owner failed: ${profErr.message}` };
  }

  // 4. Audit
  await admin.from("audit_logs").insert({
    shop_id: shop.id,
    actor_id: session.user.id,
    action: "create_shop_with_owner",
    entity: "shops",
    entity_id: shop.id,
    details: { email, username: username || null },
  });

  revalidatePath("/super-admin/shops");
  revalidatePath("/super-admin/owners");
  revalidatePath("/super-admin");
  return { success: `Shop "${shopName}" created. ${email} can now sign in as its Shop Admin.` };
}

async function requireSuper() {
  const s = await getSessionProfile();
  return s && s.profile.role === "super_admin" ? s : null;
}

// Super admin: edit shop details, status and license count.
export async function updateShop(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSuper();
  if (!s) return { error: "Not authorized" };
  const id = String(fd.get("shop_id") || "").trim();
  const name = String(fd.get("name") || "").trim();
  if (!id || !name) return { error: "Shop name is required." };
  const status = String(fd.get("status") || "active") === "suspended" ? "suspended" : "active";
  const licRaw = String(fd.get("license_limit") || "").trim();
  const lic = licRaw === "" ? null : Math.floor(Number(licRaw));
  if (lic !== null && (!Number.isFinite(lic) || lic < 0)) return { error: "License count must be 0 or more (empty = unlimited)." };
  const admin = createAdminClient();
  const base = { name, phone: String(fd.get("phone") || "").trim() || null, address: String(fd.get("address") || "").trim() || null, status };
  let { error } = await admin.from("shops").update({ ...base, license_limit: lic }).eq("id", id);
  if (error && /license_limit/.test(error.message)) {
    if (lic !== null) return { error: "Run migration 0018_license_limit.sql in the Supabase SQL editor first, then set the license count." };
    ({ error } = await admin.from("shops").update(base).eq("id", id));
  }
  if (error) return { error: error.message };
  await admin.from("audit_logs").insert({ shop_id: id, actor_id: s.user.id, action: "update_shop", entity: "shops", entity_id: id, details: { name, status, license_limit: lic } });
  revalidatePath("/super-admin/shops");
  return { success: "Shop updated." };
}

// Super admin: reset the password of any shop owner or employee.
export async function resetUserPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSuper();
  if (!s) return { error: "Not authorized" };
  const id = String(fd.get("user_id") || "").trim();
  const password = String(fd.get("password") || "");
  if (!id) return { error: "Missing user." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role,shop_id").eq("id", id).maybeSingle();
  if (!prof || !["shop_admin", "employee"].includes(prof.role)) return { error: "User not found." };
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };
  await admin.from("audit_logs").insert({ shop_id: prof.shop_id, actor_id: s.user.id, action: "reset_password", entity: "profiles", entity_id: id, details: {} });
  return { success: "Password changed. Share the new password with them." };
}

// Super admin: delete a shop. Blocked while it still has agreements or phones.
export async function deleteShop(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireSuper();
  if (!s) return { error: "Not authorized" };
  const id = String(fd.get("shop_id") || "").trim();
  if (!id) return { error: "Missing shop." };
  const admin = createAdminClient();
  const [agr, dev] = await Promise.all([
    admin.from("installment_agreements").select("*", { count: "exact", head: true }).eq("shop_id", id),
    admin.from("devices").select("*", { count: "exact", head: true }).eq("shop_id", id),
  ]);
  if ((agr.count ?? 0) > 0 || (dev.count ?? 0) > 0) {
    return { error: "This shop has agreements or phones on record, so it can't be deleted. Suspend it instead." };
  }
  const { data: people } = await admin.from("profiles").select("id").eq("shop_id", id);
  const { error } = await admin.from("shops").delete().eq("id", id);
  if (error) return { error: "Could not delete — the shop still has related records. Suspend it instead." };
  for (const p of people ?? []) await admin.auth.admin.deleteUser(p.id);
  revalidatePath("/super-admin/shops"); revalidatePath("/super-admin/owners"); revalidatePath("/super-admin/employees");
  return { success: "Shop deleted." };
}
