"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createModel, type ActionState } from "@/app/shop/models/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add model"}</Button>; }
export function NewModelForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createModel, initial);
  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New model</Button></div>;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>New phone model</CardTitle>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
      <CardContent>
        {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
        {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="brand">Brand *</Label><Input id="brand" name="brand" placeholder="Samsung" required /></div>
            <div className="space-y-1.5"><Label htmlFor="model_name">Model *</Label><Input id="model_name" name="model_name" placeholder="Galaxy A15" required /></div>
            <div className="space-y-1.5"><Label htmlFor="variant">Variant</Label><Input id="variant" name="variant" placeholder="6/128" /></div>
            <div className="space-y-1.5"><Label htmlFor="ram">RAM</Label><Input id="ram" name="ram" placeholder="6GB" /></div>
            <div className="space-y-1.5"><Label htmlFor="storage">Storage</Label><Input id="storage" name="storage" placeholder="128GB" /></div>
            <div className="space-y-1.5"><Label htmlFor="color">Color</Label><Input id="color" name="color" placeholder="Black" /></div>
            <div className="space-y-1.5"><Label htmlFor="retail_price">Retail price</Label><Input id="retail_price" name="retail_price" type="number" step="0.01" placeholder="150000" /></div>
            <div className="space-y-1.5"><Label htmlFor="default_deposit">Default deposit</Label><Input id="default_deposit" name="default_deposit" type="number" step="0.01" placeholder="30000" /></div>
            <div className="space-y-1.5"><Label htmlFor="stock_qty">Stock qty</Label><Input id="stock_qty" name="stock_qty" type="number" placeholder="0" /></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div>
        </form>
      </CardContent>
    </Card>
  );
}
