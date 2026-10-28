"use client";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changePassword, type ActionState } from "@/app/employee/profile/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>; }
export function ChangePasswordForm() {
  const [state, action] = useFormState(changePassword, initial);
  return (<Card className="max-w-md"><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent>
    {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
    {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
    <form action={action} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" required /></div>
      <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" required /></div>
      <div className="flex justify-end"><Sub /></div>
    </form>
  </CardContent></Card>);
}
