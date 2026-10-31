import { createAdminClient } from "@/lib/supabase/admin";

export type License = { limit: number | null; used: number; remaining: number | null };

// A "license" = one agreement (one phone sold). Every agreement of the shop counts,
// whatever its status. limit null = unlimited (or migration 0018 not run yet).
export async function getLicense(shopId: string): Promise<License> {
  const admin = createAdminClient();
  const { count } = await admin.from("installment_agreements").select("*", { count: "exact", head: true }).eq("shop_id", shopId);
  const used = count ?? 0;
  const { data, error } = await admin.from("shops").select("license_limit").eq("id", shopId).maybeSingle();
  const limit = error ? null : ((data as { license_limit: number | null } | null)?.license_limit ?? null);
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

export const LICENSE_MSG = "License limit reached — this shop has used all its licenses. Please contact the super admin to get more.";
