"use client";
import { useFormState, useFormStatus } from "react-dom";
import { QrCode, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateEnrollmentToken, type ActionState } from "@/app/shop/device-management/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}><QrCode className="h-3.5 w-3.5" /> {pending ? "…" : "Enrollment token"}</Button>; }
export function EnrollTokenButton({ deviceId, agreementId }: { deviceId: string; agreementId?: string | null }) {
  const [state, action] = useFormState(generateEnrollmentToken, initial);
  return (
    <div className="space-y-2">
      <form action={action}><input type="hidden" name="device_id" value={deviceId} /><input type="hidden" name="agreement_id" value={agreementId ?? ""} /><Sub /></form>
      {state.success && <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
    </div>
  );
}
