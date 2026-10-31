import { promises as fs } from "fs";
import path from "path";
import { Apple, Download, MonitorSmartphone, Smartphone, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// "Install App" for shop admins and employees: ONE download per computer. The setup file inside
// works out what to do itself — a new / factory-reset phone gets the full setup, a phone that's
// already set up just gets the newer app (customer + lock status unchanged).
// The kit is generated for the signed-in user's shop by /api/setup-kit/[os].
// "1.6.0" >= "1.6.0"? Compares dotted numbers; anything unreadable counts as older.
function atLeast(v: string | null, min: string): boolean {
  if (!v) return false;
  const a = v.split(".").map(Number), b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

export async function InstallApp() {
  const kit = path.join(process.cwd(), "setup-kit");
  let version: string | null = null;
  let built: string | null = null;
  try { version = (await fs.readFile(path.join(kit, "version.txt"), "utf8")).trim() || null; } catch { /* written by publish-app.command */ }
  try { built = (await fs.stat(path.join(kit, "MoneyMobile.apk"))).mtime.toLocaleString(); } catch { /* kit missing — the download route explains */ }

  const Kit = ({ os, title, icon: Icon, file, run }: { os: "windows" | "mac"; title: string; icon: typeof Apple; file: string; run: string }) => (
    <Card className="flex flex-col">
      <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" /> {title}</CardTitle></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <a href={`/api/setup-kit/${os}`} download className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">
          <Download className="h-4 w-4" /> Download for {title}{version ? ` (v${version})` : ""}
        </a>
        <p className="text-xs text-muted-foreground">Unzip, plug in the phone, run <code>{file}</code>. {run}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Install the MoneyMobile app on a phone</h2>
        <p className="text-sm text-muted-foreground">
          One file for every phone. A <b>new or factory-reset</b> phone is installed, locked-down and registered to your shop.
          A phone that&apos;s <b>already set up</b> just gets the newest app — its customer and lock status stay the same.
          {version ? ` Current app: v${version}` : ""}{built ? ` (built ${built})` : ""}.
        </p>
      </div>

      {atLeast(version, "1.6.0") && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="font-medium">New in v1.6: phones lock themselves on the due date — even offline</p>
          <p className="mt-1">
            Once the due date + grace days pass, the phone locks with no internet, even in airplane mode. The customer sees the lock date in the app
            and gets reminders 2 days and 1 day before. The phone only needs to have been online once since the due date was set or changed.
            Phones already set up get this by running the same setup file.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Kit os="windows" title="Windows" icon={MonitorSmartphone} file="setup-windows.bat" run={'If "Windows protected your PC" appears: More info → Run anyway.'} />
        <Kit os="mac" title="macOS" icon={Apple} file="setup-mac.command" run="First time: right-click → Open → Open. After that, double-click." />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> New or factory-reset phone — prepare it first</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Finish the welcome screens. <b>Don&apos;t add a Google or Samsung account yet</b> (the customer can add one later for the Play Store).</li>
            <li>Connect to the <b>same Wi-Fi as the computer</b> running this website.</li>
            <li>Turn on <b>USB debugging</b>: Settings → About phone → Software information → tap <i>Build number</i> 7 times, then Settings → Developer options → <i>USB debugging</i> ON.</li>
            <li>Put the customer&apos;s SIM in — removing or changing it later locks the phone.</li>
            <li>Plug the phone in, tap <b>Allow</b> on the phone, run the setup file and wait for <b>DONE</b>. Then assign the phone to a customer (find it by its IMEI).</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">Already set-up phone? Just plug it in and run the same file — no preparation needed.</p>
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>The download contains your shop&apos;s setup secret. Anyone with it can register phones to your shop — keep it inside the shop.</p>
      </div>
    </div>
  );
}
