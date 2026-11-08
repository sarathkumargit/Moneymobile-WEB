"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProvisioningQrError, buildProvisioningPayload, parseSetupKitConfig } from "@/lib/devices/provisioning-qr";

// "Set up with a QR code" — the no-cable way to enrol a new or factory-reset phone.
// It only reads the same setup details the USB setup file uses (GET /api/setup-kit/config) and draws
// them as a QR code. Nothing is stored. The code contains the shop's enrol secret, so it is created
// only when asked for, never cached, and removed from the page after a few minutes.

const VISIBLE_MS = 3 * 60 * 1000;

type View =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; src: string; shopName: string; appVersionNote: string }
  | { state: "error"; message: string };

async function loadQrImage(signal: AbortSignal): Promise<{ src: string; shopName: string; appVersionNote: string }> {
  let res: Response;
  try {
    res = await fetch("/api/setup-kit/config", { cache: "no-store", credentials: "same-origin", signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ProvisioningQrError("Could not reach the server. Check the internet connection and try again.");
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const apiMessage = typeof (body as { error?: unknown } | null)?.error === "string" ? (body as { error: string }).error : null;
    if (res.status === 401) throw new ProvisioningQrError("Your session has ended. Please sign in again.");
    throw new ProvisioningQrError(apiMessage ?? `The server could not prepare the setup details (error ${res.status}).`);
  }

  const cfg = parseSetupKitConfig(body);
  if (!cfg) throw new ProvisioningQrError("The server sent setup details in an unexpected format.");

  const payload = buildProvisioningPayload(cfg);
  // Loaded on demand so the QR library is not part of the page's initial download.
  const QRCode = (await import("qrcode")).default;
  // Level "L": the code is dense (it carries the secret and two web addresses), and lower error
  // correction means bigger squares, which phone cameras read more reliably on a screen.
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "L",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    shopName: cfg.shopName,
    appVersionNote: cfg.apk ? `App file built ${cfg.apk.built.slice(0, 10)}` : "",
  };
}

export function SetupQrCard() {
  const [view, setView] = useState<View>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const hide = useCallback(() => {
    abortRef.current?.abort();
    clearTimer();
    setView({ state: "idle" });
  }, [clearTimer]);

  const show = useCallback(async () => {
    abortRef.current?.abort();
    clearTimer();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ state: "loading" });
    try {
      const image = await loadQrImage(controller.signal);
      if (controller.signal.aborted) return;
      setView({ state: "ready", ...image });
      timerRef.current = setTimeout(() => setView({ state: "idle" }), VISIBLE_MS);
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof ProvisioningQrError ? e.message : "Could not create the QR code. Please try again.";
      setView({ state: "error", message });
    }
  }, [clearTimer]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" aria-hidden /> Set up with a QR code (no cable)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          For a <strong>new or factory-reset phone</strong>. The phone installs MoneyMobile by itself during its first-time setup — the same result as the USB
          setup file, with the same protections. It needs Wi-Fi on the phone and the phone must not have any Google account added yet.
        </p>

        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Reset the phone, or take it out of the box, so it shows the first <em>Welcome</em> screen.</li>
          <li>Tap the same spot on the screen <strong>6 times</strong>. A QR scanner opens (if asked, allow the camera and connect to Wi-Fi).</li>
          <li>Press <strong>Show QR code</strong> below and scan it with the phone.</li>
          <li>Wait while the phone downloads and installs the app, then follow the on-screen steps. Do not add a Google account on the phone yet.</li>
        </ol>

        {view.state === "idle" || view.state === "error" ? (
          <div className="space-y-3">
            <Button type="button" onClick={show}>
              <QrCode aria-hidden /> Show QR code
            </Button>
            {view.state === "error" && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {view.message}
              </p>
            )}
          </div>
        ) : null}

        {view.state === "loading" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing the QR code…
          </p>
        )}

        {view.state === "ready" && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              {/* A plain <img>: this is a one-off data: URL, so next/image has nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={view.src}
                alt={`Setup QR code${view.shopName ? ` for ${view.shopName}` : ""}`}
                width={360}
                height={360}
                className="h-auto w-full max-w-[360px] rounded-xl border bg-white"
              />
              {view.appVersionNote && <p className="text-xs text-muted-foreground">{view.appVersionNote}</p>}
            </div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <strong>Keep this private.</strong> The code contains your shop&apos;s setup secret — anyone who scans it can register phones to your shop. It hides itself
              after 3 minutes.
            </p>
            <Button type="button" variant="outline" onClick={hide}>
              <EyeOff aria-hidden /> Hide QR code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
