import { kitApkInfo } from "@/lib/devices/kit-apk";
import { Apple, Download, MonitorSmartphone, Smartphone, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupQrCard } from "@/components/devices/setup-qr-card";

// "Install App" for shop admins and employees: ONE download per computer. The setup file inside
// works out what to do itself — a new / factory-reset phone gets the full setup, a phone that's
// already set up just gets the newer app (customer + lock status unchanged).
// The kit is generated for the signed-in user's shop by /api/setup-kit/[os].

export async function InstallApp() {
  // Newest published version (App Updates) or the bundled setup-kit file, whichever is newer.
  const info = await kitApkInfo();
  const version = info?.version ?? null;
  const built = info?.builtAt ? info.builtAt.toLocaleString("en-LK", { timeZone: "Asia/Colombo" }) : null;

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
          {version ? ` Current app: v${version}` : ""}{built ? ` (${info?.source === "release" ? "published" : "built"} ${built})` : ""}.
        </p>
      </div>

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
          <details className="mt-3 rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Setup failing on a particular brand? Extra steps</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li><b>Every brand:</b> Settings → Accounts must be empty — remove Google, Samsung, Xiaomi and any other account before running the setup file.</li>
              <li><b>Xiaomi / Redmi / POCO:</b> in Developer options turn on <i>USB debugging (Security settings)</i> — Xiaomi asks you to sign in to a Mi account for it: sign in, switch it on, then <b>sign out again</b> (Find device off) before running the setup file. <i>Install via USB</i> is not needed: when the setup file says <i>ON THE PHONE: tap INSTALL</i>, tap Install on the phone. Turn on <i>Stay awake</i> and keep the phone unlocked.</li>
              <li><b>Oppo / Realme / OnePlus:</b> if Developer options has <i>Disable permission monitoring</i>, turn it on.</li>
              <li><b>Any brand:</b> if the phone shows an &quot;Install via USB?&quot; prompt during setup, tap <i>Install</i>.</li>
              <li><b>QR code:</b> works best on Android 10 or newer. If QR setup shows &quot;Something went wrong&quot;, reset the phone and use the USB setup file — and check <i>Device Mgmt → Setup reports</i> for the reason.</li>
            </ul>
          </details>
        </CardContent>
      </Card>

      <SetupQrCard />

      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>The download contains your shop&apos;s setup secret. Anyone with it can register phones to your shop — keep it inside the shop.</p>
      </div>
    </div>
  );
}
