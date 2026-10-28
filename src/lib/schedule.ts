import "server-only";

export type ScheduleRow = {
  id: string; seq: number; due_date: string; due_at?: string | null; amount: number; paid: number; status: string;
};

// The exact moment an installment is due: the date+time (due_at) when set, else the date at midnight.
function dueMoment(row: { due_date: string; due_at?: string | null }): Date {
  if (row.due_at) { const d = new Date(row.due_at); if (!isNaN(d.getTime())) return d; }
  return new Date(row.due_date + "T00:00:00");
}

// A row is overdue when its due date (+ grace days) has passed and it isn't fully paid.
export function isOverdue(row: { due_date: string; due_at?: string | null; status: string }, graceDays: number, now = new Date()): boolean {
  if (row.status === "paid") return false;
  const due = dueMoment(row);
  due.setDate(due.getDate() + (graceDays || 0));
  return now.getTime() > due.getTime();
}

// Display status for one installment row (what the customer page shows).
export function rowDisplayStatus(row: { due_date: string; due_at?: string | null; status: string }, graceDays: number, now = new Date()): "paid" | "partial" | "overdue" | "due" | "upcoming" {
  if (row.status === "paid") return "paid";
  if (isOverdue(row, graceDays, now)) return "overdue";
  if (row.status === "partial") return "partial";
  const due = dueMoment(row);
  const soon = new Date(now); soon.setDate(soon.getDate() + 7);
  return due.getTime() <= soon.getTime() ? "due" : "upcoming";
}

// Spreads a cash payment across the schedule, oldest installment first. Returns the per-row
// updates to apply. A row becomes 'paid' once its full amount is covered, else 'partial'.
export function allocatePayment(rows: ScheduleRow[], amount: number): { id: string; paid: number; status: string }[] {
  let left = Math.round(amount * 100) / 100;
  const updates: { id: string; paid: number; status: string }[] = [];
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (left <= 0) break;
    const owed = Math.round((Number(r.amount) - Number(r.paid)) * 100) / 100;
    if (owed <= 0) continue;
    const pay = Math.min(owed, left);
    const newPaid = Math.round((Number(r.paid) + pay) * 100) / 100;
    updates.push({ id: r.id, paid: newPaid, status: newPaid >= Number(r.amount) - 0.001 ? "paid" : "partial" });
    left = Math.round((left - pay) * 100) / 100;
  }
  return updates;
}

export function countOverdue(rows: { due_date: string; due_at?: string | null; status: string }[], graceDays: number, now = new Date()): number {
  return rows.filter((r) => isOverdue(r, graceDays, now)).length;
}
