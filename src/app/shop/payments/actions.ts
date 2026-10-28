"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allocatePayment, type ScheduleRow } from "@/lib/schedule";
import { evaluateOverdueLock } from "@/lib/overdue-lock";
import { deviceSnapshot, missingSnapshotColumn, type DeviceSnapshot } from "@/lib/device-snapshot";
export type ActionState = { error?: string; success?: string };
export async function recordPayment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) return { error: "Not authorized" };
  const agreement_id = String(fd.get("agreement_id") || "").trim();
  const amount = Number(String(fd.get("amount") || "0") || 0);
  if (!agreement_id) return { error: "Select an agreement." };
  if (amount <= 0) return { error: "Amount must be greater than zero." };
  const supabase = createClient();
  const { data: agr, error: aErr } = await supabase.from("installment_agreements").select("outstanding_balance, customer_id, device_id").eq("id", agreement_id).single();
  if (aErr || !agr) return { error: "Agreement not found." };
  // Record which phone this payment is for (model + IMEI), so it stays on the payment for good.
  let snap = await deviceSnapshot(supabase, (agr as { device_id?: string | null }).device_id);
  if (!snap.device_imei) {
    const { data: saved } = await supabase.from("installment_agreements").select("device_model,device_imei").eq("id", agreement_id).maybeSingle();
    if (saved) snap = saved as DeviceSnapshot;
  }
  const payment = {
    shop_id: s.profile.shop_id, agreement_id, customer_id: agr.customer_id, amount,
    method: (String(fd.get("method") || "cash")) as string, reference: String(fd.get("reference") || "").trim() || null,
    verification: "verified" as const, recorded_by: s.user.id,
  };
  let { error: pErr } = await supabase.from("payment_transactions").insert({ ...payment, ...snap });
  if (missingSnapshotColumn(pErr)) ({ error: pErr } = await supabase.from("payment_transactions").insert(payment)); // migration 0016 not run yet
  if (pErr) return { error: pErr.message };
  const newBalance = Math.max(Number(agr.outstanding_balance) - amount, 0);
  await supabase.from("installment_agreements").update({
    outstanding_balance: newBalance, ...(newBalance === 0 ? { status: "completed" } : {}),
  }).eq("id", agreement_id);

  // Tick off the installment months this cash covers (oldest first), then re-check the overdue
  // lock: if every overdue month is now cleared, the phone unlocks on its next check-in.
  let unlockedForOverdue = false;
  try {
    const { data: rows } = await supabase.from("installment_schedules").select("id,seq,due_date,amount,paid,status").eq("agreement_id", agreement_id);
    const updates = allocatePayment((rows ?? []) as ScheduleRow[], amount);
    for (const u of updates) await supabase.from("installment_schedules").update({ paid: u.paid, status: u.status }).eq("id", u.id);
    // Use the admin client so the lock state is authoritative regardless of who recorded the payment.
    const result = await evaluateOverdueLock(createAdminClient(), agreement_id);
    unlockedForOverdue = result === "unlocked";
  } catch (e) {
    console.warn("[payment] schedule/overdue update skipped (run migrations 0014):", (e as Error).message);
  }
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "record_payment", entity: "payment_transactions", entity_id: agreement_id, details: { amount, newBalance } });
  revalidatePath("/shop/payments"); revalidatePath("/shop/installments"); revalidatePath("/shop");
  revalidatePath("/employee/payments"); revalidatePath("/employee");
  const note = unlockedForOverdue ? " Overdue cleared — the phone unlocks on its next check-in." : newBalance === 0 ? " Fully paid." : "";
  return { success: `Payment of ${amount.toLocaleString()} recorded. New balance: ${newBalance.toLocaleString()}.${note}` };
}
