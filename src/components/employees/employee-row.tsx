"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Power, Trash2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateEmployee, setEmployeeActive, deleteEmployee, type ActionState } from "@/app/shop/employees/actions";

type Emp = { id: string; full_name: string | null; username: string | null; status: "active" | "disabled" };
const initial: ActionState = {};
function Save() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>; }

export function EmployeeRow({ emp }: { emp: Emp }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editState, editAction] = useFormState(updateEmployee, initial);
  const [delState, delAction] = useFormState(deleteEmployee, initial);
  const active = emp.status === "active";

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="p-4 font-medium">{emp.full_name ?? "—"}</td>
        <td className="p-4 text-muted-foreground">{emp.username ? `@${emp.username}` : "—"}</td>
        <td className="p-4"><Badge variant={active ? "success" : "neutral"} className="capitalize">{emp.status}</Badge></td>
        <td className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <form action={setEmployeeActive}>
              <input type="hidden" name="employee_id" value={emp.id} />
              <input type="hidden" name="active" value={active ? "false" : "true"} />
              <Button type="submit" size="sm" variant="outline"><Power className="h-3.5 w-3.5" /> {active ? "Deactivate" : "Activate"}</Button>
            </form>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30">
          <td colSpan={4} className="p-4">
            {editState.error && <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{editState.error}</div>}
            {editState.success && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{editState.success}</div>}
            <div className="flex items-center justify-between">
              <form action={editAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="employee_id" value={emp.id} />
                <div className="space-y-1"><label className="text-xs text-muted-foreground">Full name</label><Input name="full_name" defaultValue={emp.full_name ?? ""} className="h-9" /></div>
                <div className="space-y-1"><label className="text-xs text-muted-foreground">Username</label><Input name="username" defaultValue={emp.username ?? ""} className="h-9" /></div>
                <Save />
              </form>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 border-t pt-3">
              {delState.error && <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{delState.error}</div>}
              {!confirmDel ? (
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5" /> Delete account</Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">Delete {emp.full_name ?? "this employee"}? Deactivate instead if they have records.</span>
                  <form action={delAction}><input type="hidden" name="employee_id" value={emp.id} /><Button type="submit" size="sm" variant="destructive">Yes, delete</Button></form>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>Cancel</Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
