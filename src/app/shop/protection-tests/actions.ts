"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadDoc } from "@/lib/shared/storage";
import { setFlash } from "@/lib/shared/flash";
import type { TestMethod, TestResult } from "@/lib/devices/model-risk";
export type ActionState = { error?: string; success?: string };

const METHODS: TestMethod[] = ["recovery_reset", "frp_tool", "firmware_flash", "mdm_tool", "other"];
const RESULTS: TestResult[] = ["held", "bypassed"];
const missingTable = (msg?: string) => !!msg && /model_protection_tests|relation .* does not exist|schema cache/i.test(msg);

function revalidateAll() {
  revalidatePath("/shop/protection-tests");
  revalidatePath("/super-admin/protection-tests");
  revalidatePath("/shop/installments");
}

/** Record one unlock / flash test on a phone model. Shop owner and employees can record. */
export async function addProtectionTest(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) return { error: "Not authorized" };
  const str = (k: string, max = 120) => { const v = String(fd.get(k) || "").trim().slice(0, max); return v || null; };
  const brand = str("brand", 40);
  const model = str("model", 60);
  const method = str("method", 20) as TestMethod | null;
  const result = str("result", 10) as TestResult | null;
  if (!brand || !model) return { error: "Brand and model are required." };
  if (!method || !METHODS.includes(method)) return { error: "Choose what you tried." };
  if (!result || !RESULTS.includes(result)) return { error: "Choose the result: protection held, or tool bypassed it." };
  const patch = str("security_patch", 10);
  if (patch && !/^\d{4}-\d{2}-\d{2}$/.test(patch)) return { error: "Security patch must be a date (YYYY-MM-DD)." };
  const testedRaw = str("tested_at", 10);
  const testedAt = testedRaw && /^\d{4}-\d{2}-\d{2}$/.test(testedRaw) ? new Date(`${testedRaw}T12:00:00+05:30`) : new Date();
  if (testedAt.getTime() > Date.now() + 86400000) return { error: "The test date can't be in the future." };

  const photo = await uploadDoc(fd.get("photo"), `protection-tests/${s.profile.shop_id}`);
  const admin = createAdminClient();
  const row = {
    shop_id: s.profile.shop_id, brand, model, method, result,
    android_version: str("android_version", 20), security_patch: patch,
    tool_name: str("tool_name", 60), tool_version: str("tool_version", 40),
    notes: str("notes", 1000), photo_path: photo, tested_at: testedAt.toISOString(), created_by: s.user.id,
  };
  const { data, error } = await admin.from("model_protection_tests").insert(row).select("id").single();
  if (error) {
    if (missingTable(error.message)) return { error: "Run migration 0025_model_protection_tests.sql in Supabase first." };
    return { error: error.message };
  }
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "protection_test_recorded", entity: "model_protection_tests", entity_id: data?.id ?? null, details: { brand, model, method, result, tool: row.tool_name } });
  revalidateAll();
  return { success: `Saved: ${brand} ${model} — ${result === "held" ? "protection held" : "tool bypassed it"}.` };
}

/** Delete a wrongly entered test. Shop owner only. */
export async function deleteProtectionTest(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || s.profile.role !== "shop_admin") return;
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const admin = createAdminClient();
  const { data: row } = await admin.from("model_protection_tests").select("id,shop_id,brand,model,method,result").eq("id", id).maybeSingle();
  if (!row || row.shop_id !== s.profile.shop_id) return;
  await admin.from("model_protection_tests").delete().eq("id", id);
  await admin.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "protection_test_deleted", entity: "model_protection_tests", entity_id: id, details: row });
  setFlash("Test deleted.");
  revalidateAll();
}
