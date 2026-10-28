"use client";
import { useState } from "react";
import { Download, Copy, Check, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Shows the shop's device-setup config and lets staff download config.txt for the setup file.
export function DeviceSetupCard({ shopId, secret }: { shopId: string; secret: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch {}
  };
  const downloadConfig = () => {
    const body = `# MoneyMobile setup config\nSHOP_ID=${shopId}\nSHOP_SECRET=${secret}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "config.txt"; a.click();
    URL.revokeObjectURL(url);
  };
  const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">{value}</code>
        <Button type="button" size="sm" variant="outline" onClick={() => copy(label, value)}>
          {copied === label ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Device setup</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use the setup file to register a new phone in one step. Download <code>config.txt</code> below and keep it next to the setup file and <code>MoneyMobile.apk</code>.
        </p>
        <Field label="Shop ID" value={shopId} />
        <Field label="Shop secret" value={secret} />
        <Button type="button" onClick={downloadConfig}><Download className="h-4 w-4" /> Download config.txt</Button>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground">On the shop computer, one time per phone:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>On the phone, turn on <b>USB debugging</b> (Settings → Developer options) and remove any Google/Samsung accounts (WhatsApp can stay).</li>
            <li>Plug the phone in by USB and tap <b>Allow</b> on it.</li>
            <li>Double-click <b>setup-windows.bat</b> (Windows) or <b>setup-mac.command</b> (Mac). It installs the app, enables management and registers the phone.</li>
            <li>The phone appears here by its <b>IMEI</b> — assign it to a customer when you create their agreement.</li>
          </ol>
          <p className="pt-1">Keep the shop secret private. Anyone with it can register a phone to your shop.</p>
        </div>
      </CardContent>
    </Card>
  );
}
