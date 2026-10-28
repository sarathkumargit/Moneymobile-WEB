"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Trash2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCustomer, deleteCustomer, type ActionState } from "@/app/shop/customers/actions";

type Cust = { id: string; full_name: string; national_id: string | null; phone: string | null; email: string | null; address: string | null };
const initial: ActionState = {};
function SaveBtn() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>; }
function DeleteBtn() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="destructive" disabled={pending}>{pending ? "Deleting…" : "Yes, delete"}</Button>; }

// Shop-admin only: edit or delete this customer.
export function CustomerManage({ customer }: { customer: Cust }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editState, editAction] = useFormState(updateCustomer, initial);
  const [delState, delAction] = useFormState(deleteCustomer, initial);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit customer</Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Edit customer</p>
        <button onClick={() => { setOpen(false); setConfirmDel(false); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {editState.success && <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{editState.success}</div>}
      {editState.error && <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{editState.error}</div>}
      <form action={editAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="customer_id" value={customer.id} />
        <div className="space-y-1.5"><Label htmlFor="cm_name">Full name *</Label><Input id="cm_name" name="full_name" defaultValue={customer.full_name} required /></div>
        <div className="space-y-1.5"><Label htmlFor="cm_nic">NIC</Label><Input id="cm_nic" name="national_id" defaultValue={customer.national_id ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="cm_phone">Phone</Label><Input id="cm_phone" name="phone" defaultValue={customer.phone ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="cm_email">Email</Label><Input id="cm_email" name="email" defaultValue={customer.email ?? ""} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cm_addr">Address</Label><Input id="cm_addr" name="address" defaultValue={customer.address ?? ""} /></div>
        <div className="sm:col-span-2 flex justify-end"><SaveBtn /></div>
      </form>

      <div className="mt-4 border-t pt-4">
        {delState.error && <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{delState.error}</div>}
        {!confirmDel ? (
          <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5" /> Delete customer</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Delete {customer.full_name}? This can&apos;t be undone.</span>
            <form action={delAction}><input type="hidden" name="customer_id" value={customer.id} /><DeleteBtn /></form>
            <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}
