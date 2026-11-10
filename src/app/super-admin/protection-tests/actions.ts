"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/shared/flash";
import { modelKey } from "@/lib/devices/model-risk";

const VERDICTS = ["safe", "risky", "not_allowed"] as const;

/** Platform-wide verdict for a model (applies to every shop). Super admin only. */
export async function setModelVerdict(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || s.profile.role !== "super_admin") return;
  const brand = String(fd.get("brand") || "").trim().slice(0, 40);
  const model = String(fd.get("model") || "").trim().slice(0, 60);
  const verdict = String(fd.get("verdict") || "").trim();
  const reason = String(fd.get("reason") || "").trim().slice(0, 300) || null;
  const key = modelKey(brand, model);
  const admin = createAdminClient();
  if (!key) { setFlash("Brand and model are required.", "error"); return; }
  if (verdict === "clear") {
    await admin.from("model_protection_verdicts").delete().eq("model_key", key);
    await admin.from("audit_logs").insert({ shop_id: null, actor_id: s.user.id, action: "model_verdict_cleared", entity: "model_protection_verdicts", entity_id: null, details: { brand, model } });
    setFlash(`Platform verdict removed for ${brand} ${model}.`);
  } else {
    if (!(VERDICTS as readonly string[]).includes(verdict)) { setFlash("Choose a verdict.", "error"); return; }
    const { error } = await admin.from("model_protection_verdicts").upsert({ model_key: key, brand, model, verdict, reason, set_by: s.user.id, set_at: new Date().toISOString() });
    if (error) { setFlash(/does not exist|schema cache/i.test(error.message) ? "Run migration 0025 first." : error.message, "error"); return; }
    await admin.from("audit_logs").insert({ shop_id: null, actor_id: s.user.id, action: "model_verdict_set", entity: "model_protection_verdicts", entity_id: null, details: { brand, model, verdict, reason } });
    setFlash(`${brand} ${model}: platform verdict saved.`);
  }
  revalidatePath("/super-admin/protection-tests");
  revalidatePath("/shop/protection-tests");
}
