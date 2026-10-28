"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAgreement, type ActionState } from "@/app/shop/installments/actions";
const initial: ActionState = {};
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create agreement"}</Button>; }
export function NewAgreementForm({ customers, devices }: { customers: { id: string; full_name: string }[]; devices: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createAgreement, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New agreement</Button></div>;
  return (<Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>New installment agreement</CardTitle><button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
    <CardContent>
      {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
      {customers.length === 0 ? <p className="text-sm text-muted-foreground">Register a customer first.</p> : (
      <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="customer_id">Customer *</Label><select id="customer_id" name="customer_id" className={selectCls} required><option value="">— select —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2"><Label htmlFor="device_id">Device</Label><select id="device_id" name="device_id" className={selectCls}><option value="">— none —</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="total_price">Total price *</Label><Input id="total_price" name="total_price" type="number" step="0.01" required /></div>
        <div className="space-y-1.5"><Label htmlFor="deposit">Deposit</Label><Input id="deposit" name="deposit" type="number" step="0.01" defaultValue="0" /></div>
        <div className="space-y-1.5"><Label htmlFor="installment_amount">Installment</Label><Input id="installment_amount" name="installment_amount" type="number" step="0.01" /></div>
        <div className="space-y-1.5"><Label htmlFor="frequency">Frequency</Label><select id="frequency" name="frequency" className={selectCls}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option></select></div>
        <div className="space-y-1.5"><Label htmlFor="first_due_date">First due date</Label><Input id="first_due_date" name="first_due_date" type="date" /></div>
        <div className="space-y-1.5"><Label htmlFor="grace_days">Grace days</Label><Input id="grace_days" name="grace_days" type="number" defaultValue="0" /></div>
      </div><p className="text-xs text-muted-foreground">Financed amount = total − deposit, calculated on the server.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div></form>)}
    </CardContent></Card>);
}
