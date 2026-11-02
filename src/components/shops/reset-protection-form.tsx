"use client";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateResetProtection, type ActionState } from "@/app/shop/settings/actions";

const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>; }

export function ResetProtectionForm({ current, summary }: { current: string; summary: { on: number; total: number; unsupported: number; unknown: number } }) {
  const [state, action] = useFormState(updateResetProtection, initial);
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Reset protection</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          If a customer factory-resets a phone with the Power and Volume buttons, the phone will only finish setup after someone
          signs in with <b>your shop&apos;s Google account</b>. The customer&apos;s own account won&apos;t work, so they must come back to the shop.
          When a phone is fully paid and released, the protection is removed automatically. Needs Android 11 or newer.
        </p>
        {summary.total > 0 && (
          <p className="rounded-lg bg-muted px-3 py-2">
            <b>{summary.on}</b> of {summary.total} phone{summary.total > 1 ? "s" : ""} protected
            {summary.unsupported > 0 && <> · <span className="text-red-700 dark:text-red-400">{summary.unsupported} can&apos;t be protected (old Android)</span></>}
            {summary.unknown > 0 && <> · {summary.unknown} need app 1.10.1 to report</>}
          </p>
        )}
        {state.success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
        {state.error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
        <form action={action} className="space-y-1.5">
          <Label htmlFor="frp_account_ids">Shop Google account ID</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="frp_account_ids" name="frp_account_ids" defaultValue={current} placeholder="e.g. 109876543210987654321" className="max-w-md font-mono" inputMode="numeric" />
            <Sub />
          </div>
          <p className="text-xs text-muted-foreground">The account&apos;s number, not its email. For a backup account, add a second number separated by a comma (up to 3).</p>
        </form>
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer font-medium">How to get your Google account ID</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>Use a Google account only for the shop (e.g. <code>yourshop.phones@gmail.com</code>). Turn on 2-Step Verification and save its <b>backup codes</b>.</li>
            <li>On a computer open <code>developers.google.com/oauthplayground</code>.</li>
            <li>In <b>Step 1</b>, in &quot;Input your own scopes&quot;, paste <code>https://www.googleapis.com/auth/userinfo.profile</code> and click <b>Authorize APIs</b>. Sign in with the <b>shop</b> account.</li>
            <li>Click <b>Exchange authorization code for tokens</b>.</li>
            <li>In <b>Step 3</b>, set the Request URI to <code>https://people.googleapis.com/v1/people/me?personFields=names</code> and click <b>Send the request</b>.</li>
            <li>Find <code>&quot;resourceName&quot;: &quot;people/1234…&quot;</code>. Copy the number after <code>people/</code> and paste it above.</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Keep this account safe: it is the only way to unlock a reset phone. Don&apos;t change its password often — for about 3 days after a
            password change, Google refuses it on a reset phone.
          </p>
        </details>
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer font-medium">A customer brought back a reset phone</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>On the welcome screen, connect to Wi-Fi and sign in with the shop&apos;s Google account.</li>
            <li>Finish setup, then open Settings → Accounts and remove the shop account.</li>
            <li>Factory-reset from <b>Settings</b> (not the buttons), then set the phone up again with the USB setup file.</li>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}
