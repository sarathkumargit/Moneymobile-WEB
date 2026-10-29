"use client";
import { Button } from "@/components/ui/button";
import { updateScheduleDueDate } from "@/app/shop/installments/schedule-actions";
import { toSLInput } from "@/lib/srilanka-time";

// Inline date+time editor for one installment's due moment. Times are Sri Lanka time (where the
// shop operates), so staff always type and read the same wall-clock regardless of their own zone.
export function DueDateEditor({ scheduleId, customerId, dueAtIso, dueDate }: { scheduleId: string; customerId: string; dueAtIso: string | null; dueDate: string }) {
  const value = dueAtIso ? toSLInput(dueAtIso) : `${dueDate}T00:00`;
  return (
    <form action={updateScheduleDueDate} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="datetime-local" name="due_date" defaultValue={value} className="h-8 rounded-md border border-input bg-card px-2 text-xs" title="Sri Lanka time" />
      <span className="text-[10px] text-muted-foreground">SL</span>
      <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">Save</Button>
    </form>
  );
}
