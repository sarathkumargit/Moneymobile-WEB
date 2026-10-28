"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recordPayment, type ActionState } from "@/app/shop/payments/actions";
const initial: ActionState = {};
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>; }
export function NewPaymentForm({ agreements }: { agreements: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(recordPayment, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record payment</Button></div>;
  return (<Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Record payment</CardTitle><button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
    <CardContent>
      {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
      {agreements.length === 0 ? <p className="text-sm text-muted-foreground">Create an agreement first.</p> : (
      <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="agreement_id">Agreement *</Label><select id="agreement_id" name="agreement_id" className={selectCls} required><option value="">— select —</option>{agreements.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="amount">Amount *</Label><Input id="amount" name="amount" type="number" step="0.01" required /></div>
        <div className="space-y-1.5"><Label htmlFor="method">Method</Label><select id="method" name="method" className={selectCls}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="mobile_wallet">Mobile wallet</option><option value="other">Other</option></select></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="reference">Reference</Label><Input id="reference" name="reference" placeholder="Receipt / txn ref" /></div>
      </div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div></form>)}
    </CardContent></Card>);
}
