"use client";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetDeviceRecord, deleteDevice } from "@/app/shop/device-management/actions";

// "Reset for resale" and "Delete phone" — both ask for confirmation first.
export function DeviceAdminButtons({ deviceId, customerId, label, compact }: { deviceId: string; customerId?: string | null; label: string; compact?: boolean }) {
  const ask = (msg: string) => (e: React.FormEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  return (
    <div className="flex flex-wrap gap-2">
      <form action={resetDeviceRecord} onSubmit={ask(`Reset ${label} for resale?\n\nThis unlinks it from its customer and clears its history. Then factory reset the phone and run the setup file again — it comes back as a new phone.`)}>
        <input type="hidden" name="device_id" value={deviceId} />
        {customerId && <input type="hidden" name="customer_id" value={customerId} />}
        <Button type="submit" size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400">
          <RotateCcw className="h-3.5 w-3.5" /> {compact ? "Resale" : "Reset for resale"}
        </Button>
      </form>
      <form action={deleteDevice} onSubmit={ask(`Delete ${label} completely?\n\nThe phone and all its records are removed from MoneyMobile. Customer payments and agreements are kept.\n\nIf the phone still has the MoneyMobile app, Release it or factory reset it first. This cannot be undone.`)}>
        <input type="hidden" name="device_id" value={deviceId} />
        <Button type="submit" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> {compact ? "Delete" : "Delete phone"}
        </Button>
      </form>
    </div>
  );
}
