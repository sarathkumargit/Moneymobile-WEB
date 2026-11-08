import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatSL } from "@/lib/shared/srilanka-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Report = {
  id: string; stage: string; brand: string | null; model: string | null; android_version: string | null; sdk_int: number | null;
  app_version: string | null; device_owner: boolean; enrolled: boolean; imei_readable: boolean; steps: string | null; crash: string | null; created_at: string;
};

const DAYS = 7;
const LIMIT = 20;

/** Plain-language result of one report. */
function outcome(r: Report): { label: string; variant: "success" | "warning" | "danger" } {
  if (r.crash) return { label: "App crashed during setup", variant: "danger" };
  if (r.enrolled && r.device_owner) return r.imei_readable ? { label: "Set up OK", variant: "success" } : { label: "Set up — IMEI not readable", variant: "warning" };
  if (!r.device_owner) return { label: "Setup did not finish", variant: "danger" };
  return { label: "Not registered yet", variant: "warning" };
}

/**
 * Device Mgmt: "Setup reports" — what phones (app 1.10.8+) reported while being set up, so a phone that
 * fails on any brand shows why. Hidden when there are no reports in the last week, or if migration 0022
 * has not been run, so the page looks exactly as before otherwise.
 */
export async function SetupReportsCard() {
  try {
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    const { data, error } = await createClient().from("device_setup_reports")
      .select("id,stage,brand,model,android_version,sdk_int,app_version,device_owner,enrolled,imei_readable,steps,crash,created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(LIMIT);
    if (error || !data?.length) return null;
    const rows = data as Report[];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Setup reports (last {DAYS} days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sent by phones while they are being set up (QR or USB). If a phone shows &quot;Something went wrong&quot;, its report here says where it stopped.
          </p>
          <ul className="divide-y rounded-lg border">
            {rows.map((r) => {
              const o = outcome(r);
              return (
                <li key={r.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{[r.brand, r.model].filter(Boolean).join(" ") || "Unknown phone"}</span>
                    <Badge variant={o.variant}>{o.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      Android {r.android_version ?? "?"}{r.sdk_int ? ` (API ${r.sdk_int})` : ""} · app {r.app_version ?? "?"} · {formatSL(r.created_at)}
                    </span>
                  </div>
                  {(r.steps || r.crash) && (
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                      {r.steps && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{r.steps}</pre>}
                      {r.crash && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">{r.crash}</pre>}
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    );
  } catch {
    return null;
  }
}
