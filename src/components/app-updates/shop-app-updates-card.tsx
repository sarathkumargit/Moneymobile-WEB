import { Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ENR_UPDATE_COLS, isActive, statusText, updateBlocker, ONLINE_UPDATE_MIN_CODE, type EnrForUpdate } from "@/lib/devices/app-updates";
import { requestAppUpdate, requestAppUpdateAll, cancelAppUpdate } from "@/app/shop/device-management/app-update-actions";
import { SubmitButton } from "@/components/app-updates/submit-button";
import { AutoRefresh } from "@/components/app-updates/auto-refresh";

type Row = EnrForUpdate & { model: string | null; imei1: string | null; customer: { full_name: string } | null };
type Req = { id: string; enrollment_id: string; status: string; detail: string | null; created_at: string };

/**
 * Device Mgmt: "App update available" card. Hidden unless the super admin has made a newer app
 * available to this shop, so the page looks exactly as before otherwise. Hidden on any error too.
 */
export async function ShopAppUpdatesCard() {
  try {
    const supabase = createClient();
    const s = await getSessionProfile();
    const { data: rel, error } = await supabase.from("app_releases").select("id,version_code,version_name,notes")
      .in("status", ["published", "testing"]).not("version_code", "is", null)
      .order("version_code", { ascending: false }).limit(1).maybeSingle();
    if (error || !rel) return null;
    const release = rel as { id: string; version_code: number; version_name: string | null; notes: string | null };
    const [{ data: enrs, error: e1 }, { data: reqs }] = await Promise.all([
      supabase.from("device_enrollments").select(`${ENR_UPDATE_COLS},model,imei1, customer:customers(full_name)`).neq("status", "released").order("created_at", { ascending: false }),
      supabase.from("device_app_updates").select("id,enrollment_id,status,detail,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (e1) return null;
    const latestReq: Record<string, Req> = {};
    for (const r of (reqs ?? []) as Req[]) if (!latestReq[r.enrollment_id]) latestReq[r.enrollment_id] = r;

    const rows = ((enrs ?? []) as unknown as Row[]).filter((e) => !!e.last_sync);
    const behind = rows.filter((e) => (e.app_version_code ?? 0) < release.version_code);
    if (behind.length === 0) return null;
    const ready = behind.filter((e) => !updateBlocker(e, release) && !isActive(latestReq[e.id]?.status));
    const needUsb = behind.filter((e) => e.app_version_code == null || e.app_version_code < ONLINE_UPDATE_MIN_CODE).length;
    const anyActive = behind.some((e) => isActive(latestReq[e.id]?.status));
    const name = release.version_name ?? String(release.version_code);

    return (
      <Card>
        <AutoRefresh active={anyActive} />
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-2"><Download className="h-4 w-4" /> App update available: v{name}<Badge variant="neutral">{behind.length} phone{behind.length > 1 ? "s" : ""} on an older app</Badge></CardTitle></CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6">
            <p className="text-sm text-muted-foreground">
              {release.notes ? <>{release.notes} · </> : null}Phones install it by themselves when online. Lock, unlock and payments keep working the whole time.
              {needUsb > 0 && <> {needUsb} phone{needUsb > 1 ? "s need" : " needs"} one USB update first (old app).</>}
            </p>
            {s?.profile.role === "shop_admin" && ready.length > 1 && (
              <form action={requestAppUpdateAll}><SubmitButton size="sm" busyText="Sending…">Update all ({ready.length})</SubmitButton></form>
            )}
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
            {behind.map((e) => {
              const r = latestReq[e.id];
              const active = isActive(r?.status);
              const blocker = updateBlocker(e, release);
              return (<tr key={e.id} className="border-t">
                <td className="p-3"><div className="font-medium">{e.customer?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{e.model ?? ""} {e.imei1 ? `· ${e.imei1}` : ""}</div></td>
                <td className="p-3 text-muted-foreground">v{e.app_version ?? "?"}</td>
                <td className="p-3 text-xs">
                  {active && r ? <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{statusText(r.status, r.detail)}</span>
                    : r?.status === "failed" ? <span className="text-red-700 dark:text-red-400">{statusText(r.status, r.detail)}</span>
                    : blocker ? <span className="text-muted-foreground">{blocker}</span> : null}
                </td>
                <td className="p-3 text-right">
                  {active && r ? (r.status !== "installing" && (
                    <form action={cancelAppUpdate}><input type="hidden" name="request_id" value={r.id} /><SubmitButton size="sm" variant="ghost" busyText="Cancelling…">Cancel</SubmitButton></form>
                  )) : !blocker ? (
                    <form action={requestAppUpdate}><input type="hidden" name="enrollment_id" value={e.id} /><SubmitButton size="sm" variant="outline" busyText="Sending…">{r?.status === "failed" ? "Try again" : "Update"}</SubmitButton></form>
                  ) : null}
                </td>
              </tr>);
            })}
          </tbody></table></div>
        </CardContent>
      </Card>
    );
  } catch {
    return null;
  }
}
