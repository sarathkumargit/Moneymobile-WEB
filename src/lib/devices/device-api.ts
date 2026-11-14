import { createHash, randomBytes } from "crypto";
import { firstOverdueAt, overdueMoments } from "@/lib/billing/schedule";

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

  type SchedRow = { due_date: string; due_at?: string | null; amount: number | null; paid?: number | null; status: string };
  // due_at (exact due time) comes from migration 0015; fall back to date-only until it has run.
  // paid (part-payments, migration 0014) is read when present so the phone shows what is really left.
  const loadSchedule = async (): Promise<SchedRow[]> => {
    const withPaid = await admin.from("installment_schedules").select("due_date,due_at,amount,paid,status").eq("agreement_id", agreementId).neq("status", "paid").order("due_date", { ascending: true });
    if (!withPaid.error) return (withPaid.data ?? []) as SchedRow[];
    const full = await admin.from("installment_schedules").select("due_date,due_at,amount,status").eq("agreement_id", agreementId).neq("status", "paid").order("due_date", { ascending: true });
    if (!full.error) return (full.data ?? []) as SchedRow[];
    const basic = await admin.from("installment_schedules").select("due_date,amount,status").eq("agreement_id", agreementId).neq("status", "paid").order("due_date", { ascending: true });
    return (basic.data ?? []) as SchedRow[];
  };
  // Open unlock window (staff Unlock / unlock code). Separate query so a database without the column
  // (migration 0018 not run) still returns the agreement exactly as before.
  const loadHoldUntil = async (): Promise<number> => {
    const { data, error } = await admin.from("installment_agreements").select("unlock_grace_until").eq("id", agreementId).maybeSingle();
    const until = error ? null : (data as { unlock_grace_until?: string | null } | null)?.unlock_grace_until;
    const t = until ? new Date(until).getTime() : 0;
    return isNaN(t) ? 0 : t;
  };
  const [sched, { data: pays }, holdUntil] = await Promise.all([
    loadSchedule(),
    admin.from("payment_transactions").select("amount").eq("agreement_id", agreementId),
    loadHoldUntil(),
  ]);
  // What is still owed on one installment row (amount minus any part-payment).
  const left = (x: { amount: number | null; paid?: number | null }) => Math.max(0, Number(x.amount || 0) - Number(x.paid || 0));
  // Nothing owed (balance 0): leftover unpaid schedule rows must not show a next due date, overdue
  // amount or deadline on the phone.
  const settled = Number(a.outstanding_balance || 0) <= 0;
  const unpaid = settled ? [] : sched;
  const next = unpaid[0];
  let daysOverdue = 0;
  if (next) daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(next.due_date).getTime()) / 86400000));
  const nowMs = Date.now();
  const overdueAmount = unpaid
    .filter((x: { due_date: string }) => new Date(x.due_date).getTime() < nowMs)
    .reduce((sum: number, x: { amount: number | null; paid?: number | null }) => sum + left(x), 0);

  const paymentsSum = (pays ?? []).reduce((s: number, p: { amount: number | null }) => s + Number(p.amount || 0), 0);
  const total_paid = Number(a.deposit || 0) + paymentsSum; // deposit + verified payments

  let status = "active";
  if (Number(a.outstanding_balance) <= 0) status = "paid";
  else if ((a as { restriction?: string }).restriction === "restricted") status = "restricted";
  else if (daysOverdue > (a.grace_days || 0)) status = "overdue";

  const cust = (a as { customers?: { full_name?: string } }).customers;
  const shop = (a as { shops?: { name?: string; phone?: string } }).shops;
  const restriction = (a as { restriction?: string }).restriction ?? "active";
  const locked = restriction === "restricted" && !settled;
  // Offline lock: when the first unpaid installment goes overdue (UTC epoch ms), plus the server's
  // clock. The phone keeps both, so it can lock itself on time with no internet and can tell if
  // someone moves the phone's date backwards. null = nothing to enforce (paid, released, cancelled).
  const enforced = (a as { status?: string }).status === "active" && !settled;
  let lockAt = enforced ? firstOverdueAt(unpaid, a.grace_days || 0) : null;
  // While an unlock window is open (staff Unlock / unlock code) the phone must not lock itself for a
  // deadline that has already passed: give it the end of the window instead. When the window ends and
  // the money is still owed, the phone locks at that moment — with or without internet — and the
  // server's next check-in agrees (lib/billing/overdue-lock.ts).
  if (lockAt && holdUntil > nowMs && lockAt.getTime() < holdUntil) lockAt = new Date(holdUntil);
  // The following months' deadlines (after the first), so a phone that stays offline for months
  // still locks on every missed month, even right after a shop unlock code cleared one.
  const laterLockAt = enforced && lockAt ? overdueMoments(unpaid, a.grace_days || 0).filter((t) => t > lockAt!.getTime()).slice(0, 24) : [];
  return {
    server_time: Date.now(),
    overdue_lock_at: lockAt ? lockAt.getTime() : null,
    later_lock_at: laterLockAt,
    id: a.id, status, locked, customer_name: cust?.full_name ?? "",
    shop_name: shop?.name ?? "", shop_phone: shop?.phone ?? "",
    next_due_date: next?.due_date ?? null,
    next_due_amount: next ? left(next) : settled ? 0 : Number(a.installment_amount || 0),
    outstanding_balance: Number(a.outstanding_balance || 0),
    overdue_amount: overdueAmount,
    grace_period_days: a.grace_days || 0, days_overdue: daysOverdue,
    total_price: Number(a.total_price || 0),
    deposit: Number(a.deposit || 0),
    total_paid,
  };
}

// Agreements that belong to a finished sale (the phone was handed over or the deal was cancelled).
const ENDED = ["released", "cancelled"];

// Resolves the agreement to show for an enrollment, even if the enrollment
// row was created without an explicit agreement_id: falls back to the agreement
// tied to the device, then to the customer's most recent active agreement.
export async function resolveAgreementId(
  admin: Admin,
  enr: { agreement_id?: string | null; device_id?: string | null; customer_id?: string | null }
): Promise<string | null> {
  if (enr.agreement_id) return enr.agreement_id;

  if (enr.device_id) {
    // Newest agreement for this phone that is still live. A released / cancelled one belongs to an
    // earlier sale: a resold phone must never pick up the previous customer's agreement.
    const { data } = await admin
      .from("installment_agreements")
      .select("id,status,created_at")
      .eq("device_id", enr.device_id)
      .order("created_at", { ascending: false })
      .limit(10);
    const live = (data ?? []).find((a: { status: string | null }) => !ENDED.includes(String(a.status)));
    if (live?.id) return live.id;
  }

  if (enr.customer_id) {
    // Only an agreement that belongs to THIS phone, or to no phone yet. A customer with two phones
    // must never get the other phone's balance / lock state.
    const { data } = await admin
      .from("installment_agreements")
      .select("id,status,created_at,device_id")
      .eq("customer_id", enr.customer_id)
      .order("created_at", { ascending: false })
      .limit(10);
    const mine = (data ?? []).find((a: { device_id: string | null; status: string | null }) =>
      (!a.device_id || a.device_id === enr.device_id) && !ENDED.includes(String(a.status)));
    if (mine?.id) return mine.id;
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

