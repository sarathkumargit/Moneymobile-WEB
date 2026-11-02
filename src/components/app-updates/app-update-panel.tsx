import { Download, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatSLTime } from "@/lib/shared/srilanka-time";
import { ENR_UPDATE_COLS, isActive, statusText, updateBlocker, type EnrForUpdate } from "@/lib/devices/app-updates";
import { requestAppUpdate, cancelAppUpdate } from "@/app/shop/device-management/app-update-actions";
import { SubmitButton } from "@/components/app-updates/submit-button";
import { AutoRefresh } from "@/components/app-updates/auto-refresh";

type Req = { id: string; status: string; detail: string | null; created_at: string; updated_at: string; app_releases: { version_name: string | null; version_code: number | null } | null };

/**
 * "App update" box for one phone (customer page). Shows nothing at all until the super admin has made
 * an update available or this phone has an update in progress, so the page is unchanged otherwise.
 * Self-contained: any problem (e.g. migration 0020 not run yet) simply hides it.
 */
export async function AppUpdatePanel({ enrollmentId, customerId }: { enrollmentId: string; customerId: string }) {
  try {
    const supabase = createClient();
    const [{ data: enr, error: e1 }, { data: rel, error: e2 }, { data: req, error: e3 }] = await Promise.all([
      supabase.from("device_enrollments").select(ENR_UPDATE_COLS).eq("id", enrollmentId).maybeSingle(),
      supabase.from("app_releases").select("id,version_code,version_name").in("status", ["published", "testing"])
        .not("version_code", "is", null).order("version_code", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("device_app_updates").select("id,status,detail,created_at,updated_at, app_releases(version_name,version_code)")
        .eq("enrollment_id", enrollmentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (e1 || e2 || e3 || !enr) return null;
    const e = enr as unknown as EnrForUpdate;
    const last = req as unknown as Req | null;
    const release = rel as { id: string; version_code: number; version_name: string | null } | null;
    const active = isActive(last?.status);
    const recentFinish = last && !active && Date.now() - new Date(last.updated_at).getTime() < 3 * 24 * 3600 * 1000;
    const upToDate = !!release && e.app_version_code != null && e.app_version_code >= release.version_code;
    if (!release && !active && !recentFinish) return null;
    if (e.status === "released") return null;

    const target = last?.app_releases?.version_name ?? (last?.app_releases?.version_code != null ? `build ${last.app_releases.version_code}` : "");
    const blocker = release ? updateBlocker(e, release) : null;
    const box = "mt-3 space-y-2 rounded-lg border px-3 py-2.5 text-sm";

    return (
      <div className={box}>
        <AutoRefresh active={active} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">App {e.app_version ? `v${e.app_version}` : ""}</span>
            {release && !upToDate && !active && <span className="text-xs text-muted-foreground">· v{release.version_name ?? release.version_code} available</span>}
            {upToDate && !active && <span className="text-xs text-emerald-700 dark:text-emerald-400">· up to date</span>}
          </div>
          {active && last ? (
            last.status !== "installing" && (
              <form action={cancelAppUpdate}>
                <input type="hidden" name="request_id" value={last.id} /><input type="hidden" name="customer_id" value={customerId} />
                <SubmitButton size="sm" variant="ghost" busyText="Cancelling…">Cancel update</SubmitButton>
              </form>
            )
          ) : release && !blocker ? (
            <form action={requestAppUpdate}>
              <input type="hidden" name="enrollment_id" value={e.id} /><input type="hidden" name="customer_id" value={customerId} />
              <SubmitButton size="sm" busyText="Sending…"><Download className="h-3.5 w-3.5" /> {last?.status === "failed" ? "Try again" : `Update to v${release.version_name ?? release.version_code}`}</SubmitButton>
            </form>
          ) : null}
        </div>

        {active && last && (
          <p className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {target && <b>v{target}:</b>} {statusText(last.status, last.detail)} · since {formatSLTime(last.created_at)}
          </p>
        )}
        {active && last && <p className="text-xs text-muted-foreground">The phone keeps working normally while it downloads. If it goes offline, it continues by itself when it's back online.</p>}
        {!active && last?.status === "installed" && recentFinish && (
          <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Updated to v{target} · {formatSLTime(last.updated_at)}</p>
        )}
        {!active && last?.status === "failed" && recentFinish && (
          <p className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Update to v{target} didn&apos;t install{last.detail ? `: ${last.detail}` : ""}. The phone still runs v{e.app_version ?? "its old app"} and works normally.</p>
        )}
        {!active && blocker && !upToDate && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {blocker}</p>
        )}
      </div>
    );
  } catch {
    return null;
  }
}
