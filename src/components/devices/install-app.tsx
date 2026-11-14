import { kitApkInfo } from "@/lib/devices/kit-apk";
import { Apple, Download, MonitorSmartphone, Smartphone, ShieldAlert, Ban, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupQrCard } from "@/components/devices/setup-qr-card";

// "Install App" for shop admins and employees: ONE download per computer. The setup file inside
// works out what to do itself — a new / factory-reset phone gets the full setup, a phone that's
// already set up just gets the newer app (customer + lock status unchanged).
// The kit is generated for the signed-in user's shop by /api/setup-kit/[os].
//
// QR setup is shown only as "blocked": since 2025 Google Play Protect blocks device-management apps that
// are not on Android Enterprise's approved list during QR setup, and phone-financing apps can't be approved.

type Brand = { name: string; steps: React.ReactNode[] };

const BRANDS: Brand[] = [
  {
    name: "Xiaomi / Redmi / POCO",
    steps: [
      <>Settings → About phone → tap <i>OS version</i> (or <i>MIUI version</i>) 7 times.</>,
      <>Settings → Additional settings → Developer options: turn on <i>USB debugging</i> and <i>Stay awake</i>.</>,
      <>Turn on <i>USB debugging (Security settings)</i>. Xiaomi asks for a Mi account: sign in, switch it on, then <b>sign out again</b> (Settings → Xiaomi account → Sign out, let it turn off Find device).</>,
      <><i>Install via USB</i> is <b>not</b> needed. If the setup file says <i>ON THE PHONE: tap INSTALL</i>, tap <i>Install</i> (and <i>Install anyway</i>).</>,
    ],
  },
  {
    name: "Samsung",
    steps: [
      <>Settings → About phone → Software information → tap <i>Build number</i> 7 times.</>,
      <>Settings → Developer options: turn on <i>USB debugging</i> and <i>Stay awake</i>.</>,
    ],
  },
  {
    name: "Oppo / Realme / OnePlus",
    steps: [
      <>Settings → About device → Version → tap <i>Build number</i> 7 times.</>,
      <>Developer options (Settings → Additional settings / System settings): turn on <i>USB debugging</i> and <i>Stay awake</i>.</>,
      <>If you see <i>Disable permission monitoring</i>, turn it on.</>,
    ],
  },
  {
    name: "Vivo / iQOO",
    steps: [
      <>Settings → About phone → Software version → tap <i>Software version</i> (or <i>Build number</i>) 7 times.</>,
      <>Developer options (Settings → System management): turn on <i>USB debugging</i> and <i>Stay awake</i>.</>,
      <>If you see <i>Install via USB</i> or a USB-install prompt during setup, allow it.</>,
    ],
  },
  {
    name: "Infinix / Tecno / itel",
    steps: [
      <>Settings → About phone → tap <i>Build number</i> 7 times.</>,
      <>Settings → System → Developer options: turn on <i>USB debugging</i> and <i>Stay awake</i>.</>,
    ],
  },
  {
    name: "Honor",
    steps: [
      <>Settings → About phone → tap <i>Build number</i> 7 times.</>,
      <>Settings → System → Developer options: turn on <i>USB debugging</i>, <i>Allow ADB debugging in charge only mode</i> (if shown) and <i>Stay awake</i>.</>,
    ],
  },
];

export async function InstallApp() {
  // Newest published version (App Updates) or the bundled setup-kit file, whichever is newer.
  const info = await kitApkInfo();
  const version = info?.version ?? null;
  // Only a published release has a real date; the bundled file's date on the server is not meaningful.
  const published = info?.source === "release" && info.builtAt ? info.builtAt.toLocaleDateString("en-LK", { timeZone: "Asia/Colombo" }) : null;

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
          One setup file for every phone, through a USB cable. A <b>new or factory-reset</b> phone is installed, locked-down and registered to your shop —
          if you already added the phone (its IMEI) to a customer, it links to that customer by itself.
          A phone that&apos;s <b>already set up</b> just gets the newest app; its customer and lock status stay the same.
          {version ? ` Current app: v${version}${published ? ` (published ${published})` : ""}.` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Kit os="windows" title="Windows" icon={MonitorSmartphone} file="setup-windows.bat" run={'If "Windows protected your PC" appears: More info → Run anyway.'} />
        <Kit os="mac" title="macOS" icon={Apple} file="setup-mac.command" run="First time: right-click → Open → Open. After that, double-click." />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> New or factory-reset phone — prepare it first</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="mb-2 font-medium">Every phone</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Finish the welcome screens and <b>skip every account</b> (Google, Samsung, Xiaomi…). <b>Settings → Accounts must be empty.</b> The customer adds a Google account after setup.</li>
              <li>Connect to <b>Wi-Fi</b> (any internet) and put the <b>customer&apos;s SIM</b> in — removing or changing it later locks the phone.</li>
              <li>Turn on Developer options, <b>USB debugging</b> and <b>Stay awake</b> — see your brand below.</li>
              <li>Plug the phone <b>straight into the computer</b> (no hub or adapter) with a cable that transfers files. On the phone choose <b>File transfer</b> and tap <b>Allow</b> (tick <i>Always allow</i>).</li>
              <li>Run the setup file, keep the phone <b>unlocked</b>, and wait for <b>DONE</b>. If the setup file asks you to tap something on the phone, do it.</li>
            </ol>
          </div>

          <div>
            <p className="mb-2 font-medium">Your brand</p>
            <div className="space-y-2">
              {BRANDS.map((b, i) => (
                <details key={b.name} open={i === 0} className="rounded-lg border p-3">
                  <summary className="cursor-pointer font-medium">{b.name}</summary>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5">{b.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                </details>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Already set-up phone? Just plug it in and run the same file — no preparation needed.</p>
          </div>

          <details className="rounded-lg border p-3">
            <summary className="flex cursor-pointer items-center gap-2 font-medium"><Wrench className="h-4 w-4" /> If the setup file stops</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li><b>Stuck at “Waiting for the phone”:</b> the computer can&apos;t see the phone. Use another cable or USB port, choose <i>File transfer</i> on the phone, and tap <i>Allow</i>.</li>
              <li><b>“An account is still signed in”:</b> remove every account in Settings → Accounts (Xiaomi: sign out of the Mi account), then run the file again — it continues from where it stopped.</li>
              <li><b>“Already set up before” / “second user”:</b> factory reset the phone, skip all accounts, and run the file again.</li>
              <li><b>Xiaomi “USB debugging (Security settings)”:</b> switch it on as shown above, then sign out of the Mi account and run the file again.</li>
              <li>Close other Android tools on the computer while setting up (Android File Transfer, other phone managers).</li>
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader><CardTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-red-600" /> QR code setup — currently blocked by Google</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Since 2025, Google Play Protect blocks phone-management apps that are not on Google&apos;s approved list during QR setup, and phone-financing apps can&apos;t be added to that list. The phone downloads MoneyMobile, blocks it, and shows <b>Reset</b>. This happens on every phone with Google Play (Samsung, Xiaomi, Infinix…).</p>
          <p><b>Use the setup file above</b> — it is not affected.</p>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium text-foreground">Show the QR code anyway (testing only — the phone will need a factory reset if it fails)</summary>
            <div className="mt-3"><SetupQrCard /></div>
          </details>
        </CardContent>
      </Card>

      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>The download contains your shop&apos;s setup secret. Anyone with it can register phones to your shop — keep it inside the shop.</p>
      </div>
    </div>
  );
}
