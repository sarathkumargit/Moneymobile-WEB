"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCustomer, type ActionState } from "@/app/shop/customers/actions";

const initial: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Register customer"}</Button>;
}

export function NewCustomerForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createCustomer, initial);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New customer</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Register customer</CardTitle>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
      </CardHeader>
      <CardContent>
        {state.success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {state.success}
          </div>
        )}
        {state.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
          </div>
        )}
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input id="full_name" name="full_name" placeholder="Ramesh Bisen" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="national_id">National ID (NIC)</Label>
              <Input id="national_id" name="national_id" placeholder="200232802491" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="+94 ..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="customer@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" placeholder="City / address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nic_photo_front">ID card photo — front (optional)</Label>
              <Input id="nic_photo_front" name="nic_photo_front" type="file" accept="image/*" className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nic_photo_back">ID card photo — back (optional)</Label>
              <Input id="nic_photo_back" name="nic_photo_back" type="file" accept="image/*" className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" />
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold">Guarantor <span className="font-normal text-muted-foreground">(optional)</span></p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="g_name">Full name</Label><Input id="g_name" name="guarantor_full_name" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_nic">NIC</Label><Input id="g_nic" name="guarantor_national_id" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_phone">Phone</Label><Input id="g_phone" name="guarantor_phone" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_email">Email</Label><Input id="g_email" name="guarantor_email" type="email" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_rel">Relationship</Label><Input id="g_rel" name="guarantor_relationship" placeholder="Father, friend…" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="g_addr">Address</Label><Input id="g_addr" name="guarantor_address" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_front">Guarantor ID — front</Label><Input id="g_front" name="guarantor_nic_front" type="file" accept="image/*" className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" /></div>
              <div className="space-y-1.5"><Label htmlFor="g_back">Guarantor ID — back</Label><Input id="g_back" name="guarantor_nic_back" type="file" accept="image/*" className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" /></div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
