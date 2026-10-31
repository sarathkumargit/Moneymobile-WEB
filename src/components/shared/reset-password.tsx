"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type State = { error?: string; success?: string };
type Act = (prev: State, fd: FormData) => Promise<State>;

function Go() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Set password"}</Button>; }

export function ResetPassword({ action, idName, id }: { action: Act; idName: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, {} as State);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><KeyRound className="h-3.5 w-3.5" /> Reset password</Button>;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={idName} value={id} />
      <Input name="password" type="text" placeholder="New password (min 6)" minLength={6} required className="h-9 w-52" />
      <Go />
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Close</Button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.success && <span className="text-xs text-emerald-600">{state.success}</span>}
    </form>
  );
}
