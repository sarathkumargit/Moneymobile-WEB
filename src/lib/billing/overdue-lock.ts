import "server-only";
import { countOverdue } from "@/lib/billing/schedule";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

// Automatic overdue enforcement, shared by the heartbeat (lock) and payment recording (unlock).
//
// Rule: if an installment due date has passed (plus grace days) and the installment isn't paid,
// the phone is locked. When a later payment clears every overdue installment, the phone is
// unlocked again — but ONLY if the lock was an overdue lock. A SIM lock or a manual Lock
// (restriction_reason 'sim' / 'manual') is never lifted automatically; staff must clear those.
//
// Unlock-code window: when the customer types a shop unlock code, the phone is open for
// OFFLINE_UNLOCK_GRACE_MINUTES (agreement.unlock_grace_until). Until then the overdue lock is NOT
// put back, even though the installment is still unpaid; after it, the next check-in locks again.
// Only the overdue lock waits — a manual or SIM lock from staff still applies straight away.

/** True while the 30-minute unlock-code window is open. False if the column doesn't exist yet
 *  (migration 0018 not run), so the lock then works exactly as before. */
async function unlockWindowOpen(admin: Admin, agreementId: string): Promise<boolean> {
  const { data, error } = await admin.from("installment_agreements").select("unlock_grace_until").eq("id", agreementId).maybeSingle();
  if (error || !data) return false;
  const until = (data as { unlock_grace_until?: string | null }).unlock_grace_until;
  return !!until && new Date(until).getTime() > Date.now();
}

export async function evaluateOverdueLock(admin: Admin, agreementId: string): Promise<"locked" | "unlocked" | "unchanged"> {
  const { data: a } = await admin
    .from("installment_agreements")
    .select("id,status,restriction,restriction_reason,grace_days,outstanding_balance")
    .eq("id", agreementId)
    .maybeSingle();
  if (!a) return "unchanged";
  // Released/completed/cancelled agreements are not enforced.
  if (!["active"].includes(a.status)) return "unchanged";

  let sched = (await admin.from("installment_schedules").select("due_date,due_at,status").eq("agreement_id", agreementId)).data as { due_date: string; due_at?: string | null; status: string }[] | null;
  if (sched === null) {
    // due_at column not present yet (migration 0015): fall back to date-only.
    sched = (await admin.from("installment_schedules").select("due_date,status").eq("agreement_id", agreementId)).data as { due_date: string; status: string }[] | null;
  }
  // Balance already 0 (fully paid): nothing can be overdue, whatever the schedule rows say.
  const overdue = Number((a as { outstanding_balance?: number | null }).outstanding_balance ?? 1) <= 0 ? 0 : countOverdue(sched ?? [], a.grace_days || 0);

  const restricted = a.restriction === "restricted";
  const reason = (a as { restriction_reason?: string | null }).restriction_reason ?? null;

  if (overdue > 0 && !restricted) {
    // The customer is inside the 30-minute window from a shop unlock code: leave the phone open.
    if (await unlockWindowOpen(admin, agreementId)) return "unchanged";
    // Lock for overdue payment.
    await admin.from("installment_agreements").update({ restriction: "restricted", restriction_reason: "overdue" }).eq("id", agreementId);
    return "locked";
  }
  if (overdue === 0 && restricted && reason === "overdue") {
    // Arrears cleared — lift the overdue lock (leaves SIM/manual locks alone).
    await admin.from("installment_agreements").update({ restriction: "active", restriction_reason: null }).eq("id", agreementId);
    return "unlocked";
  }
  return "unchanged";
}
