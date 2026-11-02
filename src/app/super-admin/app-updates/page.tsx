import { PackageOpen, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatSL } from "@/lib/shared/srilanka-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReleaseUploadForm } from "@/components/app-updates/release-upload-form";
import { SubmitButton } from "@/components/app-updates/submit-button";
import { changeReleaseStatus } from "@/app/super-admin/app-updates/actions";
import { ONLINE_UPDATE_MIN_CODE, type ReleaseRow } from "@/lib/devices/app-updates";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, { label: string; v: "success" | "warning" | "danger" | "neutral" | "default" }> = {
  uploading: { label: "Upload not finished", v: "neutral" },
  ready: { label: "Uploaded — not offered yet", v: "default" },
  testing: { label: "Testing", v: "warning" },
  published: { label: "Published to all shops", v: "success" },
  withdrawn: { label: "Withdrawn", v: "danger" },
};
const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-sm";

export default async function AppUpdatesPage() {
  const supabase = createClient();
  const { data: rels, error } = await supabase.from("app_releases")
    .select("id,version_code,version_name,storage_path,sha256,size_bytes,status,test_shop_ids,notes,created_at,published_at")
    .order("created_at", { ascending: false }).limit(30);

  if (error) {
    return (
      <Card><CardContent className="p-6 text-sm">
        <p className="font-medium">App updates are not set up yet.</p>
        <p className="mt-1 text-muted-foreground">Run <code>supabase/migrations/0020_app_updates.sql</code> once in Supabase → SQL Editor, then reload this page.</p>
      </CardContent></Card>
    );
  }
  const releases = (rels ?? []) as ReleaseRow[];
  const ids = releases.map((r) => r.id);
  const [{ data: shops }, { data: reqs }, { data: phones }] = await Promise.all([
    supabase.from("shops").select("id,name").order("name"),
    ids.length ? supabase.from("device_app_updates").select("release_id,status").in("release_id", ids) : Promise.resolve({ data: [] as { release_id: string; status: string }[] }),
    supabase.from("device_enrollments").select("app_version,app_version_code").eq("status", "enrolled"),
  ]);
  const shopName = Object.fromEntries((shops ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const counts: Record<string, Record<string, number>> = {};
  for (const r of (reqs ?? []) as { release_id: string; status: string }[]) {
    const c = (counts[r.release_id] ??= {});
    const k = r.status === "installed" ? "installed" : r.status === "failed" ? "failed" : r.status === "cancelled" ? "cancelled" : "progress";
    c[k] = (c[k] ?? 0) + 1;
  }
  // Phones in the field by app version, so you know how many still need the one-time USB update.
  const byVersion: Record<string, number> = {};
  let needUsb = 0;
  for (const p of (phones ?? []) as { app_version: string | null; app_version_code: number | null }[]) {
    const k = p.app_version ?? "unknown";
    byVersion[k] = (byVersion[k] ?? 0) + 1;
    if (p.app_version_code == null || p.app_version_code < ONLINE_UPDATE_MIN_CODE) needUsb++;
  }

  return (<>
    <ReleaseUploadForm />

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackageOpen className="h-4 w-4" /> App versions</CardTitle></CardHeader><CardContent className="p-0">
      {releases.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No app versions uploaded yet.</p> : (
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3 font-medium">Version</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Phones</th><th className="p-3 font-medium">Actions</th></tr></thead>
        <tbody>{releases.map((r) => {
          const c = counts[r.id] ?? {};
          const b = statusBadge[r.status] ?? { label: r.status, v: "neutral" as const };
          const canOffer = r.status === "ready" || r.status === "testing" || r.status === "withdrawn";
          return (<tr key={r.id} className="border-b align-top last:border-0">
            <td className="p-3">
              <div className="font-medium">{r.version_name ?? "—"} <span className="text-xs text-muted-foreground">build {r.version_code ?? "—"}</span></div>
              <div className="text-xs text-muted-foreground">{formatSL(r.created_at)}{r.size_bytes ? ` · ${(r.size_bytes / 1048576).toFixed(1)} MB` : ""}</div>
              {r.notes && <div className="mt-1 max-w-xs text-xs">{r.notes}</div>}
            </td>
            <td className="p-3">
              <Badge variant={b.v}>{b.label}</Badge>
              {r.status === "testing" && <div className="mt-1 text-xs text-muted-foreground">In: {(r.test_shop_ids ?? []).map((id) => shopName[id] ?? "a shop").join(", ")}</div>}
              {r.published_at && r.status === "published" && <div className="mt-1 text-xs text-muted-foreground">since {formatSL(r.published_at)}</div>}
            </td>
            <td className="p-3 text-xs">
              <div className="text-emerald-700 dark:text-emerald-400">{c.installed ?? 0} installed</div>
              {(c.progress ?? 0) > 0 && <div className="text-blue-700 dark:text-blue-400">{c.progress} in progress</div>}
              {(c.failed ?? 0) > 0 && <div className="text-red-700 dark:text-red-400">{c.failed} failed</div>}
            </td>
            <td className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                {canOffer && (shops ?? []).length > 0 && (
                  <form action={changeReleaseStatus} className="flex items-center gap-2">
                    <input type="hidden" name="release_id" value={r.id} /><input type="hidden" name="action" value="test" />
                    <select name="shop_id" className={selectCls} defaultValue="">
                      <option value="" disabled>Test in shop…</option>
                      {(shops ?? []).map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <SubmitButton size="sm" variant="outline">Test</SubmitButton>
                  </form>
                )}
                {canOffer && (
                  <form action={changeReleaseStatus}><input type="hidden" name="release_id" value={r.id} /><input type="hidden" name="action" value="publish" />
                    <SubmitButton size="sm" busyText="Publishing…">Publish to all shops</SubmitButton></form>
                )}
                {(r.status === "testing" || r.status === "published") && (
                  <form action={changeReleaseStatus}><input type="hidden" name="release_id" value={r.id} /><input type="hidden" name="action" value="withdraw" />
                    <SubmitButton size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">Withdraw</SubmitButton></form>
                )}
                {(r.status === "ready" || r.status === "uploading" || r.status === "withdrawn") && (c.installed ?? 0) + (c.progress ?? 0) + (c.failed ?? 0) + (c.cancelled ?? 0) === 0 && (
                  <form action={changeReleaseStatus}><input type="hidden" name="release_id" value={r.id} /><input type="hidden" name="action" value="delete" />
                    <SubmitButton size="sm" variant="ghost" className="text-red-700">Delete</SubmitButton></form>
                )}
              </div>
            </td>
          </tr>);
        })}</tbody>
      </table></div>)}
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Phones by app version</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {Object.keys(byVersion).length === 0 ? <span className="text-muted-foreground">No phones set up yet.</span>
          : Object.entries(byVersion).sort().map(([v, n]) => <Badge key={v} variant="neutral">v{v}: {n}</Badge>)}
      </div>
      {needUsb > 0 && (
        <p className="text-xs text-muted-foreground">
          {needUsb} phone{needUsb > 1 ? "s run" : " runs"} an app older than 1.10.0, which can&apos;t update online. Each needs one update with the USB setup file;
          after that, every update can be done from the website.
        </p>
      )}
      <p className="text-xs text-muted-foreground">How it works: upload → test in one shop and update a phone there → publish. Staff then press <b>Update</b> on each phone (or <b>Update all</b> in Device Mgmt). Nothing installs until staff press it.</p>
      <p className="text-xs text-muted-foreground">The published version is also what <b>Install App</b> (USB and QR setup) hands out, so new phones get it too. A version in <b>Testing</b> is only offered as an online update in the test shop.</p>
    </CardContent></Card>
  </>);
}
