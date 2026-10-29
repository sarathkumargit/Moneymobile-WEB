"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createEmployee, type ActionState } from "@/app/shop/employees/actions";

const initial: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create employee"}</Button>;
}

export function NewEmployeeForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createEmployee, initial);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New employee</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>New employee login</CardTitle>
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
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name *</Label>
              <Input id="full_name" name="full_name" placeholder="Priya N." required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" placeholder="priya" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" placeholder="staff@shop.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Temporary password *</Label>
              <Input id="password" name="password" type="text" placeholder="min 6 characters" required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The employee is tied to your shop automatically and can only see records they create or are assigned.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
