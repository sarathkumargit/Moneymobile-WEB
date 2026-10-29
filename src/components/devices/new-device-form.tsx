"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createDevice, type ActionState } from "@/app/shop/devices/actions";
const initial: ActionState = {};
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Register device"}</Button>; }
export function NewDeviceForm({ models }: { models: { id: string; brand: string; model_name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createDevice, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New device</Button></div>;
  return (<Card><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Register device</CardTitle><button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
    <CardContent>
      {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
      {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
      <form action={action} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.length > 0 && (<div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="model_id">From catalog (optional)</Label><select id="model_id" name="model_id" className={selectCls}><option value="">— manual entry —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model_name}</option>)}</select></div>)}
        <div className="space-y-1.5"><Label htmlFor="brand">Brand *</Label><Input id="brand" name="brand" required /></div>
        <div className="space-y-1.5"><Label htmlFor="model">Model *</Label><Input id="model" name="model" required /></div>
        <div className="space-y-1.5"><Label htmlFor="variant">Variant</Label><Input id="variant" name="variant" /></div>
        <div className="space-y-1.5"><Label htmlFor="imei1">IMEI 1</Label><Input id="imei1" name="imei1" placeholder="35…" /></div>
        <div className="space-y-1.5"><Label htmlFor="imei2">IMEI 2</Label><Input id="imei2" name="imei2" /></div>
        <div className="space-y-1.5"><Label htmlFor="serial_number">Serial</Label><Input id="serial_number" name="serial_number" /></div>
        <div className="space-y-1.5"><Label htmlFor="color">Color</Label><Input id="color" name="color" /></div>
        <div className="space-y-1.5"><Label htmlFor="storage">Storage</Label><Input id="storage" name="storage" /></div>
        <div className="space-y-1.5"><Label htmlFor="retail_price">Retail price</Label><Input id="retail_price" name="retail_price" type="number" step="0.01" /></div>
      </div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div></form>
    </CardContent></Card>);
}
