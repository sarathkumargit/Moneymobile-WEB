"use client";
import { formatSLTime } from "@/lib/shared/srilanka-time";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Lock, Unlock, CheckCircle2, AlertCircle, Clock, Send, XCircle, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deviceCommand, releaseDevice, type ActionState } from "@/app/shop/device-management/actions";

export type CommandRow = {
  id: string;
  command: string;
  status: string; // pending | sent | acked | failed
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
  result: string | null;
};

const initial: ActionState = {};

function Submit({ kind }: { kind: "lock" | "unlock" }) {
  const { pending } = useFormStatus();
  return kind === "lock" ? (
    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
      <Lock className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Start (Lock)"}
    </Button>
  ) : (
    <Button type="submit" size="sm" disabled={pending}>
      <Unlock className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Unlock"}
    </Button>
  );
}

// Shown while money is still owed: release is only possible at Rs 0 (the server re-checks).
function ReleaseBlocked({ owing }: { owing: number }) {
  return (
    <Button type="button" size="sm" variant="outline" disabled title="Release is available once the balance is Rs 0">
      <PackageCheck className="h-3.5 w-3.5" /> Release device (Rs {owing.toLocaleString()} due)
    </Button>
  );
}

const label = (c: string) => (c === "LOCK_DEVICE" ? "Lock" : c === "UNLOCK_DEVICE" ? "Unlock" : c === "RELEASE_DEVICE" ? "Release" : c.replace(/_/g, " ").toLowerCase());
// Always Sri Lanka time (the shop's timezone), from a fixed +5:30 offset so the string is
// identical on the server and in every browser — consistent, and no hydration mismatch.
const time = (t: string | null) => formatSLTime(t);

function StatusLine({ c }: { c: CommandRow }) {
  const base = "flex flex-wrap items-center gap-2 text-xs";
  if (c.status === "acked" && c.command === "RELEASE_DEVICE")
    return <p className={`${base} text-emerald-700 dark:text-emerald-400`}><PackageCheck className="h-3.5 w-3.5" /><b>Release</b> confirmed by phone · {time(c.acked_at)} · no longer managed</p>;
  if (c.status === "acked")
    return <p className={`${base} text-emerald-700 dark:text-emerald-400`}><CheckCircle2 className="h-3.5 w-3.5" /><b>{label(c.command)}</b> applied on phone · {time(c.acked_at)}{c.result && c.result !== "ok" ? ` · ${c.result}` : ""}</p>;
  if (c.status === "failed")
    return <p className={`${base} text-red-700 dark:text-red-400`}><XCircle className="h-3.5 w-3.5" /><b>{label(c.command)}</b> failed on phone · {time(c.acked_at)}{c.result ? ` · ${c.result}` : ""}</p>;
  if (c.status === "superseded")
    return <p className={`${base} text-muted-foreground`}><XCircle className="h-3.5 w-3.5" /><b>{label(c.command)}</b> replaced by a newer command · {time(c.created_at)}</p>;
  if (c.status === "sent")
    return <p className={`${base} text-blue-700 dark:text-blue-400`}><Send className="h-3.5 w-3.5" /><b>{label(c.command)}</b> delivered to phone at {time(c.sent_at)}, waiting for confirmation…</p>;
  return <p className={`${base} text-amber-700 dark:text-amber-400`}><Clock className="h-3.5 w-3.5" /><b>{label(c.command)}</b> queued at {time(c.created_at)}, waiting for the phone to check in…</p>;
}

function ReleaseSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">{pending ? "Releasing…" : "Yes, release permanently"}</Button>;
}

export function DeviceCommandPanel({ deviceId, customerId, commands, owing = 0, released = false, children }: { deviceId: string; customerId: string; commands: CommandRow[]; owing?: number; released?: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  const [lockState, lockAction] = useFormState(deviceCommand, initial);
  const [unlockState, unlockAction] = useFormState(deviceCommand, initial);
  const [releaseState, releaseAction] = useFormState(releaseDevice, initial);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const last = [lockState, unlockState, releaseState].reduce((a, b) => ((b.at ?? 0) > (a.at ?? 0) ? b : a));
  useEffect(() => { if (releaseState.at) setConfirmRelease(false); }, [releaseState.at]);

  // While the newest command is still in flight, re-fetch the server component every 5s
  // so the status moves queued → delivered → applied without a manual reload.
  const latest = commands[0];
  const inFlight = !!latest && (latest.status === "pending" || latest.status === "sent") && Date.now() - new Date(latest.created_at).getTime() < 15 * 60 * 1000;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [inFlight, router]);

  if (released) {
    return (
      <div className="mt-3 space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Released to the customer. The phone is no longer managed — restrictions removed, uninstall and factory reset allowed. The shop can&apos;t lock it any more.<br /><span className="mt-1 block text-xs opacity-80">Selling this phone again? Plug it in and run the setup file once. It re-registers by itself and this card switches back to Lock/Unlock.</span></span>
        </div>
        {commands.length > 0 && (
          <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Command status</p>
            {commands.map((c) => <StatusLine key={c.id} c={c} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <form action={lockAction}>
          <input type="hidden" name="device_id" value={deviceId} />
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="command" value="LOCK_DEVICE" />
          <Submit kind="lock" />
        </form>
        <form action={unlockAction}>
          <input type="hidden" name="device_id" value={deviceId} />
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="command" value="UNLOCK_DEVICE" />
          <Submit kind="unlock" />
        </form>
        {children}
        {!confirmRelease && owing > 0 && <ReleaseBlocked owing={owing} />}
        {!confirmRelease && owing <= 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRelease(true)} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400">
            <PackageCheck className="h-3.5 w-3.5" /> Release device (fully paid)
          </Button>
        )}
      </div>

      {confirmRelease && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">Release this phone permanently?</p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            The phone removes every restriction, stops being managed by MoneyMobile, and allows uninstall and factory reset. You won&apos;t be able to lock it again unless it is re-enrolled at the shop. This can&apos;t be undone from here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={releaseAction}>
              <input type="hidden" name="device_id" value={deviceId} />
              <input type="hidden" name="customer_id" value={customerId} />
              <ReleaseSubmit />
            </form>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRelease(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {last.success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4 shrink-0" />{last.success}</div>}
      {last.error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"><AlertCircle className="h-4 w-4 shrink-0" />{last.error}</div>}

      {commands.length > 0 && (
        <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground">Command status</p>
          {commands.map((c) => <StatusLine key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
