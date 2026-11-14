"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allocatePayment, type ScheduleRow } from "@/lib/billing/schedule";
import { evaluateOverdueLock } from "@/lib/billing/overdue-lock";
import { nudgePhoneByAgreement } from "@/lib/devices/nudge";
import { deviceSnapshot, missingSnapshotColumn, type DeviceSnapshot } from "@/lib/devices/device-snapshot";
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
  // A payment larger than what is owed can't be recorded correctly (the balance can't go below 0), and is
  // usually a typo — e.g. an extra zero would mark the phone fully paid and allow its release.
  const owedNow = Math.max(0, Number(agr.outstanding_balance || 0));
  if (amount > owedNow + 0.005) {
    return { error: owedNow > 0
      ? `That is more than the balance (Rs ${owedNow.toLocaleString()}). Record at most Rs ${owedNow.toLocaleString()}.`
      : "This agreement is already fully paid — nothing is owed." };
  }
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
  // Lower the balance safely when two staff record payments at the same moment: only write if the
  // balance is still the one we read; otherwise read it again and retry (no payment is lost).
  let current = Number(agr.outstanding_balance);
  let newBalance = Math.max(Math.round((current - amount) * 100) / 100, 0);
  let written = false;
  for (let attempt = 0; attempt < 5 && !written; attempt++) {
    const { data: upd, error: uErr } = await supabase.from("installment_agreements").update({
      outstanding_balance: newBalance, ...(newBalance === 0 ? { status: "completed" } : {}),
    }).eq("id", agreement_id).eq("outstanding_balance", current).select("id");
    if (uErr) break; // unexpected database answer: use the plain write below
    if (upd && upd.length) { written = true; break; }
    const { data: again } = await supabase.from("installment_agreements").select("outstanding_balance").eq("id", agreement_id).single();
    current = Number(again?.outstanding_balance ?? current);
    newBalance = Math.max(Math.round((current - amount) * 100) / 100, 0);
  }
  if (!written) {
    // Same single write as before, so the payment always counts against the balance.
    await supabase.from("installment_agreements").update({
      outstanding_balance: newBalance, ...(newBalance === 0 ? { status: "completed" } : {}),
    }).eq("id", agreement_id);
  }
  // Fully paid: nothing is owed, so no lock of any kind should remain on the record (the phone
  // already ignores it at zero balance; this keeps the dashboard honest and the Release flow clean).
  // Separate step so an older database without restriction_reason can never block the payment itself.
  if (newBalance === 0) {
    await supabase.from("installment_agreements").update({ restriction: "active", restriction_reason: null }).eq("id", agreement_id);
  }

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
  // Payment cleared a lock (or paid everything): wake the phone so it unlocks within seconds.
  if (unlockedForOverdue || newBalance === 0) {
    await nudgePhoneByAgreement(createAdminClient(), agreement_id, (agr as { device_id?: string | null }).device_id);
  }
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "record_payment", entity: "payment_transactions", entity_id: agreement_id, details: { amount, newBalance } });
  revalidatePath("/shop/payments"); revalidatePath("/shop/installments"); revalidatePath("/shop");
  revalidatePath("/employee/payments"); revalidatePath("/employee");
  const note = unlockedForOverdue ? " Overdue cleared — the phone unlocks on its next check-in." : newBalance === 0 ? " Fully paid." : "";
  return { success: `Payment of ${amount.toLocaleString()} recorded. New balance: ${newBalance.toLocaleString()}.${note}` };
}
