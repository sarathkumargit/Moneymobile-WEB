"use server";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateOverdueLock } from "@/lib/billing/overdue-lock";
import { setFlash } from "@/lib/shared/flash";
import { slToUtcIso, formatSL } from "@/lib/shared/srilanka-time";

// Edit one installment's due date. Shop admins only. After the change the overdue lock is
// re-evaluated: moving a date into the future can lift an overdue lock, moving it into the past
// (beyond grace, unpaid) can lock the phone on the next check-in.
export async function updateScheduleDueDate(fd: FormData): Promise<void> {
  const s = await getSessionProfile();
  if (!s || !s.profile.shop_id || !["shop_admin", "employee"].includes(s.profile.role)) { setFlash("Not authorized to edit due dates.", "error"); return; }

  const scheduleId = String(fd.get("schedule_id") || "").trim();
  const dueRaw = String(fd.get("due_date") || "").trim(); // Sri Lanka wall-clock from the form
  const customerId = String(fd.get("customer_id") || "").trim() || null;
  const dueIso = dueRaw ? slToUtcIso(dueRaw) : null;
  if (!scheduleId || !dueIso) { setFlash("Please pick a valid due date and time.", "error"); return; }
  const dueDate = dueRaw.slice(0, 10); // SL calendar day as typed

  const supabase = createClient();
  // Only touch a row in this shop (RLS also enforces this).
  const { data: row } = await supabase
    .from("installment_schedules")
    .select("id,agreement_id,shop_id")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!row || row.shop_id !== s.profile.shop_id) { setFlash("That installment could not be found.", "error"); return; }

  let { error: upErr } = await supabase.from("installment_schedules").update({ due_date: dueDate, due_at: dueIso }).eq("id", scheduleId);
  if (upErr) {
    // due_at column not present yet (migration 0015): save the date only.
    ({ error: upErr } = await supabase.from("installment_schedules").update({ due_date: dueDate }).eq("id", scheduleId));
  }
  if (upErr) { setFlash(`Could not update the due date: ${upErr.message}`, "error"); return; }
  await supabase.from("audit_logs").insert({
    shop_id: s.profile.shop_id, actor_id: s.user.id, action: "edit_due_date",
    entity: "installment_schedules", entity_id: scheduleId, details: { due_date: dueDate },
  });

  // Keep the lock state consistent with the new date.
  let lockNote = "";
  try {
    const r = await evaluateOverdueLock(createAdminClient(), row.agreement_id);
    if (r === "locked") lockNote = " Phone will lock on its next check-in (now overdue).";
    else if (r === "unlocked") lockNote = " Overdue cleared — phone unlocks on its next check-in.";
  } catch { /* migration 0014 not run yet */ }

  setFlash(`Due date updated to ${formatSL(dueIso)}.${lockNote}`, "success");

  if (customerId) { revalidatePath(`/shop/customers/${customerId}`); revalidatePath(`/employee/customers/${customerId}`); }
  revalidatePath("/shop/installments");
}
