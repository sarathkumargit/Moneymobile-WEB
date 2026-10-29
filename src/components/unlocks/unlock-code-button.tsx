"use client";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { KeyRound, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateUnlockKey, type ActionState } from "@/app/shop/unlocks/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}><KeyRound className="h-3.5 w-3.5" /> {pending ? "…" : "30-min unlock code"}</Button>; }

// Offline unlock: shows the 6-digit code big enough to read out over the phone, with a live
// countdown. The customer types it on the locked phone ("Enter unlock code") — no internet needed.
export function UnlockCodeButton({ deviceId }: { deviceId: string }) {
  const [state, action] = useFormState(generateUnlockKey, initial);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.expiresAt]);
  const left = state.expiresAt ? Math.max(0, state.expiresAt - now) : 0;
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return (
    <div className="space-y-2">
      <form action={action}><input type="hidden" name="device_id" value={deviceId} /><Sub /></form>
      {state.code && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="text-xs font-medium uppercase tracking-wide">Unlock code</p>
          <p className="font-mono text-3xl font-bold tracking-[0.3em]">{left > 0 ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : "expired"}</p>
          <p className="mt-1 text-xs">
            {left > 0 ? <>Valid for {mm}:{String(ss).padStart(2, "0")} · one use · works without internet.</> : "Generate a new code."}{" "}
            Customer taps <b>Enter unlock code</b> on the locked phone.
          </p>
          {state.note && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{state.note}</p>}
        </div>
      )}
      {state.error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
    </div>
  );
}
