"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
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
  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .insert({
      name: shopName,
      phone: shopPhone || null,
      address: shopAddress || null,
      owner_id: ownerId,
    })
    .select("id")
    .single();
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
