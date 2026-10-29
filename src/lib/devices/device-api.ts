import { createHash, randomBytes } from "crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(24).toString("hex");

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

// Builds the AgreementStatus payload the Android app displays on its dashboard.
export async function buildAgreementStatus(admin: Admin, agreementId: string | null) {
  if (!agreementId) return null;
  const { data: a } = await admin
    .from("installment_agreements")
    .select("id,status,restriction,outstanding_balance,grace_days,total_price,deposit,total_repayment,installment_amount, customers(full_name), shops(name,phone)")
    .eq("id", agreementId)
    .single();
  if (!a) return null;

  const [{ data: sched }, { data: pays }] = await Promise.all([
    admin.from("installment_schedules").select("due_date,amount,status").eq("agreement_id", agreementId).neq("status", "paid").order("due_date", { ascending: true }),
    admin.from("payment_transactions").select("amount").eq("agreement_id", agreementId),
  ]);
  const unpaid = sched ?? [];
  const next = unpaid[0];
  let daysOverdue = 0;
  if (next) daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(next.due_date).getTime()) / 86400000));
  const nowMs = Date.now();
  const overdueAmount = unpaid
    .filter((x: { due_date: string }) => new Date(x.due_date).getTime() < nowMs)
    .reduce((sum: number, x: { amount: number | null }) => sum + Number(x.amount || 0), 0);

  const paymentsSum = (pays ?? []).reduce((s: number, p: { amount: number | null }) => s + Number(p.amount || 0), 0);
  const total_paid = Number(a.deposit || 0) + paymentsSum; // deposit + verified payments

  let status = "active";
  if (Number(a.outstanding_balance) <= 0) status = "paid";
  else if ((a as { restriction?: string }).restriction === "restricted") status = "restricted";
  else if (daysOverdue > (a.grace_days || 0)) status = "overdue";

  const cust = (a as { customers?: { full_name?: string } }).customers;
  const shop = (a as { shops?: { name?: string; phone?: string } }).shops;
  const restriction = (a as { restriction?: string }).restriction ?? "active";
  const locked = restriction === "restricted";
  return {
    id: a.id, status, locked, customer_name: cust?.full_name ?? "",
    shop_name: shop?.name ?? "", shop_phone: shop?.phone ?? "",
    next_due_date: next?.due_date ?? null,
    next_due_amount: next ? Number(next.amount) : Number(a.installment_amount || 0),
    outstanding_balance: Number(a.outstanding_balance || 0),
    overdue_amount: overdueAmount,
    grace_period_days: a.grace_days || 0, days_overdue: daysOverdue,
    total_price: Number(a.total_price || 0),
    deposit: Number(a.deposit || 0),
    total_paid,
  };
}

// Resolves the agreement to show for an enrollment, even if the enrollment
// row was created without an explicit agreement_id: falls back to the agreement
// tied to the device, then to the customer's most recent active agreement.
export async function resolveAgreementId(
  admin: Admin,
  enr: { agreement_id?: string | null; device_id?: string | null; customer_id?: string | null }
): Promise<string | null> {
  if (enr.agreement_id) return enr.agreement_id;

  if (enr.device_id) {
    const { data } = await admin
      .from("installment_agreements")
      .select("id,status,created_at")
      .eq("device_id", enr.device_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (enr.customer_id) {
    const { data } = await admin
      .from("installment_agreements")
      .select("id,status,created_at")
      .eq("customer_id", enr.customer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

// Convenience: resolve + build in one call for the device endpoints.
export async function buildAgreementStatusForEnrollment(
  admin: Admin,
  enr: { agreement_id?: string | null; device_id?: string | null; customer_id?: string | null }
) {
  const id = await resolveAgreementId(admin, enr);
  return buildAgreementStatus(admin, id);
}

