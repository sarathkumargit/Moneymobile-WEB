import "server-only";
import { countOverdue } from "@/lib/billing/schedule";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

// Automatic overdue enforcement, shared by the heartbeat (lock) and payment recording (unlock).
//
// Rule: if an installment due date has passed (plus grace days) and the installment isn't paid,
// the phone is locked. When a later payment clears every overdue installment, the phone is
// unlocked again — but ONLY if the lock was an overdue lock. A SIM lock or a manual Lock
// (restriction_reason 'sim' / 'manual') is never lifted automatically; staff must clear those.

export async function evaluateOverdueLock(admin: Admin, agreementId: string): Promise<"locked" | "unlocked" | "unchanged"> {
  const { data: a } = await admin
    .from("installment_agreements")
    .select("id,status,restriction,restriction_reason,grace_days")
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
  const overdue = countOverdue(sched ?? [], a.grace_days || 0);

  const restricted = a.restriction === "restricted";
  const reason = (a as { restriction_reason?: string | null }).restriction_reason ?? null;

  if (overdue > 0 && !restricted) {
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
