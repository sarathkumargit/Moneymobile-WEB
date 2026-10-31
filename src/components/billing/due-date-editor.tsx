"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateScheduleDueDate } from "@/app/shop/installments/schedule-actions";
import { toSLInput } from "@/lib/shared/srilanka-time";

// Inline date+time editor for one installment's due moment. Times are Sri Lanka time (where the
// shop operates), so staff always type and read the same wall-clock regardless of their own zone.
// Underneath, a small note shows the same moment in the viewer's own time zone, so someone
// outside Sri Lanka (e.g. US time) can see exactly when the phone will lock for them.
export function DueDateEditor({ scheduleId, customerId, dueAtIso, dueDate }: { scheduleId: string; customerId: string; dueAtIso: string | null; dueDate: string }) {
  const value = dueAtIso ? toSLInput(dueAtIso) : `${dueDate}T00:00`;
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    try {
      const moment = dueAtIso ? new Date(dueAtIso) : new Date(`${dueDate}T00:00:00+05:30`);
      setLocal(moment.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }));
    } catch { setLocal(null); }
  }, [dueAtIso, dueDate]);
  return (
    <form action={updateScheduleDueDate} className="space-y-1">
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="flex items-center gap-1.5">
        <input type="datetime-local" name="due_date" defaultValue={value} className="h-9 w-48 min-w-0 rounded-lg border border-transparent bg-secondary px-2 text-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20" title="Sri Lanka time" />
        <span className="text-[10px] font-medium text-muted-foreground">Sri Lanka time</span>
        <Button type="submit" size="sm" variant="outline" className="h-9 px-3 text-xs">Save</Button>
      </div>
      {local && <p className="text-[11px] text-muted-foreground">Your time: {local}</p>}
    </form>
  );
}
