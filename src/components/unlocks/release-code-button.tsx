"use client";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { PackageOpen, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateReleaseCode, type ReleaseCodeState } from "@/app/shop/unlocks/release-actions";
const initial: ReleaseCodeState = {};
function Sub({ label }: { label: string }) { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" disabled={pending}>{pending ? "…" : label}</Button>; }
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-LK")}`;

// Offline release code (owner only): frees the phone completely without internet, so it can be
// factory reset and set up again. Asks for a reason, and confirmation when money is still owed.
export function ReleaseCodeButton({ enrollmentId }: { enrollmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(generateReleaseCode, initial);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.expiresAt]);
  const left = state.expiresAt ? Math.max(0, state.expiresAt - now) : 0;
  const hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);

  if (!open) return <Button type="button" size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => setOpen(true)}><PackageOpen className="h-3.5 w-3.5" /> Offline release code</Button>;
  return (
    <div className="w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
      <p className="text-xs text-muted-foreground">Removes <b>all</b> protection from this phone without internet: unlock, USB, reset protection and Device Owner. Use it for a test phone or a phone that must be wiped and set up again. The phone needs app v1.11.4 or newer.</p>
      {!state.code && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="enrollment_id" value={enrollmentId} />
          <Input name="reason" required minLength={5} placeholder="Why? e.g. test phone / setup failed, reinstalling" className="h-9" />
          {state.needsConfirm && (
            <label className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400"><input type="checkbox" name="confirm_owed" className="mt-0.5" required />
              <span><b>{rs(state.owed ?? 0)} is still owed.</b> After release the shop can no longer lock this phone. I understand — release it anyway.</span></label>
          )}
          <div className="flex gap-2"><Sub label={state.needsConfirm ? "Create release code anyway" : "Create release code"} /><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      )}
      {state.code && (
        <div className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="text-xs font-medium uppercase tracking-wide">Release code</p>
          <p className="font-mono text-3xl font-bold tracking-[0.2em]">{left > 0 ? `${state.code.slice(0, 5)} ${state.code.slice(5)}` : "expired"}</p>
          <p className="mt-1 text-xs">{left > 0 ? <>Valid for {hh > 0 ? `${hh} h ` : ""}{mm} min · one use · works without internet.</> : "Create a new code."}</p>
          <p className="mt-1 text-xs">On the phone: MoneyMobile → <b>Help</b> → <b>Release with shop code</b> (or on the lock screen: <b>Enter unlock code</b> → <b>Release code</b>). Then Settings → Factory reset is available again.</p>
          <p className="mt-1 text-xs text-muted-foreground">The phone tells the website when it next has internet. If you wipe it before that, use <b>Reset for resale</b> or <b>Delete phone</b> here afterwards.</p>
        </div>
      )}
      {state.note && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.note}</p>}
      {state.error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
    </div>
  );
}
