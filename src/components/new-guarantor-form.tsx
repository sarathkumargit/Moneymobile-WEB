"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createGuarantor, type ActionState } from "@/app/shop/guarantors/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add guarantor"}</Button>; }
export function NewGuarantorForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createGuarantor, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New guarantor</Button></div>;
  return (<Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>New guarantor</CardTitle><button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
    <CardContent>
      {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
      <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="full_name">Full name *</Label><Input id="full_name" name="full_name" required /></div>
        <div className="space-y-1.5"><Label htmlFor="national_id">National ID</Label><Input id="national_id" name="national_id" /></div>
        <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div>
        <div className="space-y-1.5"><Label htmlFor="relationship">Relationship</Label><Input id="relationship" name="relationship" placeholder="Father, friend…" /></div>
        <div className="space-y-1.5"><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
      </div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div></form>
    </CardContent></Card>);
}
