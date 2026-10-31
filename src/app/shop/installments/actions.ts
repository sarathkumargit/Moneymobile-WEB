"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { deviceSnapshot, missingSnapshotColumn } from "@/lib/devices/device-snapshot";
import { calcInstallment, type InterestType } from "@/lib/billing/installment";
import { getLicense, LICENSE_MSG } from "@/lib/admin/license";
import { slToUtcIso, slDate } from "@/lib/shared/srilanka-time";
export type ActionState = { error?: string; success?: string };

function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function round2(n: number) { return Math.round(n * 100) / 100; }

export async function createAgreement(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) return { error: "Not authorized" };

  const customer_id = String(fd.get("customer_id") || "").trim();
  if (!customer_id) return { error: "Select a customer." };
  const num = (k: string) => Number(String(fd.get(k) || "0") || 0);
  const selling = num("total_price");
  const deposit = num("deposit");
  const rate = num("interest_rate");
  const months = Math.floor(num("installment_months"));
  const charges = num("additional_charges");
  const itype = (String(fd.get("interest_type") || "flat")) as InterestType;
  if (selling <= 0) return { error: "Selling price must be greater than zero." };
  if (months <= 0) return { error: "Installment count must be at least 1 month." };
  if (deposit > selling) return { error: "Down payment cannot exceed the selling price." };

  // Authoritative server-side calculation (never trust the client numbers)
  const calc = calcInstallment({ selling, deposit, ratePct: rate, months, interestType: itype, charges });

  const lic = await getLicense(s.profile.shop_id);
  if (lic.limit !== null && lic.used >= lic.limit) return { error: LICENSE_MSG };

  const supabase = createClient();
  const device_id = String(fd.get("device_id") || "").trim() || null;
  // The form gives a Sri Lanka wall-clock value ("2026-11-26T17:00"); convert to the UTC instant.
  const firstDueRaw = String(fd.get("first_due_date") || "").trim();
  const firstIso = firstDueRaw ? slToUtcIso(firstDueRaw) : null;
  const firstDue = firstIso ? new Date(firstIso) : new Date(); // UTC instant of the first due moment
  const firstDueDate = slDate(firstDue.toISOString()); // SL calendar day
  const graceDays = Math.max(0, Math.floor(num("grace_days")));

  const agreementRow = {
    shop_id: s.profile.shop_id, agreement_code: "AGR-" + Date.now().toString().slice(-6),
    customer_id, device_id,
    total_price: selling, deposit, financed_amount: calc.principal,
    interest_rate: rate, interest_type: itype, installment_months: months,
    total_interest: calc.totalInterest, total_repayment: calc.totalRepayment, additional_charges: charges,
    installment_amount: calc.monthly, frequency: String(fd.get("frequency") || "monthly"),
    first_due_date: firstDueDate, grace_days: graceDays, outstanding_balance: calc.totalRepayment,
    status: "active", created_by: s.user.id,
  };
  // Keep the phone's model + IMEI on the agreement itself (survives resale / delete of the phone).
  const snap = await deviceSnapshot(supabase, device_id);
  let { data: agr, error } = await supabase.from("installment_agreements").insert({ ...agreementRow, ...snap }).select("id").single();
  if (missingSnapshotColumn(error)) ({ data: agr, error } = await supabase.from("installment_agreements").insert(agreementRow).select("id").single()); // migration 0016 not run yet
  if (error?.message?.includes("LICENSE_LIMIT")) return { error: LICENSE_MSG };
  if (error || !agr) return { error: error?.message || "Could not create agreement." };

  // Generate the payment schedule (last installment absorbs rounding). due_at keeps the exact
  // date+time; due_date is its calendar day (kept for older code paths).
  const schedules = [];
  let due = new Date(firstDue);
  for (let n = 1; n <= months; n++) {
    const amt = n < months ? calc.monthly : round2(calc.totalRepayment - calc.monthly * (months - 1));
    schedules.push({ agreement_id: agr.id, shop_id: s.profile.shop_id, seq: n, due_date: slDate(due.toISOString()), due_at: due.toISOString(), amount: amt, status: "pending" });
    due = addMonths(due, 1);
  }
  const insRes = await supabase.from("installment_schedules").insert(schedules);
  if (insRes.error) {
    // due_at column not present yet (migration 0015): insert without it.
    await supabase.from("installment_schedules").insert(schedules.map(({ due_at, ...rest }) => rest));
  }

  if (device_id) await supabase.from("devices").update({ status: "under_installment", customer_id }).eq("id", device_id);
  await supabase.from("audit_logs").insert({ shop_id: s.profile.shop_id, actor_id: s.user.id, action: "create_agreement", entity: "installment_agreements", entity_id: agr.id, details: { selling, months, monthly: calc.monthly, totalRepayment: calc.totalRepayment } });

  revalidatePath("/shop/installments"); revalidatePath("/shop"); revalidatePath("/shop/payments"); revalidatePath("/employee/installments");
  return { success: `Agreement created — ${months} × ${calc.monthly.toLocaleString()} (total ${calc.totalRepayment.toLocaleString()}). Schedule generated.` };
}
