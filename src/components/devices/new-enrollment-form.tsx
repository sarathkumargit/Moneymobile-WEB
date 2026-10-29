"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { QrCode, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateEnrollmentToken, type ActionState } from "@/app/shop/device-management/actions";
const initial: ActionState = {};
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Generating…" : "Generate token"}</Button>; }
export function NewEnrollmentForm({ devices, agreements }: { devices: { id: string; label: string }[]; agreements: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(generateEnrollmentToken, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><QrCode className="h-4 w-4" /> New enrollment token</Button></div>;
  return (<Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Enroll a device</CardTitle><button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
    <CardContent>
      {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
      {devices.length === 0 ? <p className="text-sm text-muted-foreground">Register a device first.</p> : (
      <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="device_id">Device *</Label><select id="device_id" name="device_id" className={selectCls} required><option value="">— select —</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="agreement_id">Agreement</Label><select id="agreement_id" name="agreement_id" className={selectCls}><option value="">— none —</option>{agreements.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      </div><p className="text-xs text-muted-foreground">The app is then pointed at this platform&apos;s API URL and sends this token during USB enrollment.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div></form>)}
    </CardContent></Card>);
}
