import { promises as fs } from "fs";
import path from "path";
import { CheckCircle2, XCircle, Server, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const dynamic = "force-dynamic";

// Platform settings for the super admin: own password, whether the server is configured, and which
// phone app version the Install App download currently ships. Only "set / not set" is shown for
// secrets — never their values.
export default async function SettingsPage() {
  const kit = path.join(process.cwd(), "setup-kit");
  const version = (await fs.readFile(path.join(kit, "version.txt"), "utf8").catch(() => "")).trim() || null;
  const built = await fs.stat(path.join(kit, "MoneyMobile.apk")).then((s) => s.mtime.toLocaleString("en-LK", { timeZone: "Asia/Colombo" })).catch(() => null);
  const firebaseFile = await fs.stat(path.join(process.cwd(), "firebase-service-account.json")).then(() => true).catch(() => false);

  const checks: { label: string; ok: boolean; hint: string }[] = [
    { label: "Database (Supabase) address", ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL, hint: "NEXT_PUBLIC_SUPABASE_URL" },
    { label: "Database public key", ok: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, hint: "NEXT_PUBLIC_SUPABASE_ANON_KEY" },
    { label: "Database service key (phone check-ins)", ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY, hint: "SUPABASE_SERVICE_ROLE_KEY" },
    { label: "Push messages (Firebase)", ok: !!process.env.FIREBASE_SERVICE_ACCOUNT || firebaseFile, hint: "FIREBASE_SERVICE_ACCOUNT" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-4 w-4" /> Server status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {checks.map((c) => (
              <div key={c.hint} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  {!c.ok && <p className="text-xs text-muted-foreground">Missing: set <code>{c.hint}</code> in the host&apos;s environment variables.</p>}
                </div>
                {c.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="h-5 w-5 shrink-0 text-red-600" />}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Phone app download</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Version shops download</span>{version ? <Badge variant="default">v{version}</Badge> : <Badge variant="danger">not published</Badge>}</div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">App file built</span><span>{built ?? "—"}</span></div>
            <p className="pt-2 text-xs text-muted-foreground">
              To ship a new app version: double-click <code>publish-app.command</code> in the Money mobile folder, then deploy this website.
              Shops then get it from Install App (Windows and Mac) for new phones and for updating phones that are already set up.
            </p>
          </CardContent>
        </Card>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
