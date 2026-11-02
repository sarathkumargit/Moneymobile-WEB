import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { frpBadge, parseAccountIds, platformIds, type FrpEnr } from "@/lib/devices/reset-protection";

const COLS = "id,shop_id,status,last_sync,app_version_code,frp_state,frp_accounts,frp_checked_at";

/** Loads reset-protection badges for many phones at once. Empty map on any error (e.g. migration 0021 not run). */
export async function loadFrpBadges(enrollmentIds: string[]) {
  const out: Record<string, ReturnType<typeof frpBadge>> = {};
  if (!enrollmentIds.length) return out;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("device_enrollments").select(COLS).in("id", enrollmentIds);
    if (error || !data) return out;
    const rows = data as unknown as Array<FrpEnr & { id: string; shop_id: string }>;
    const shopIds = Array.from(new Set(rows.map((r) => r.shop_id)));
    const { data: shops, error: sErr } = await supabase.from("shops").select("id,frp_account_ids").in("id", shopIds);
    if (sErr) return out;
    const expected: Record<string, string[]> = {};
    for (const s of (shops ?? []) as Array<{ id: string; frp_account_ids: string | null }>) {
      expected[s.id] = Array.from(new Set([...parseAccountIds(s.frp_account_ids ?? "").ids, ...platformIds()])).sort();
    }
    for (const r of rows) out[r.id] = frpBadge(r, expected[r.shop_id] ?? platformIds().sort());
  } catch { /* hidden */ }
  return out;
}

/** Small badge (Device Mgmt table). */
export function FrpBadgeView({ b }: { b?: ReturnType<typeof frpBadge> }) {
  if (!b) return null;
  return <Badge variant={b.variant} className="mt-1" title={b.detail}>{b.label}</Badge>;
}

/** Customer page: badge plus, when the phone isn't protected, what that means. */
export async function ResetProtectionStatus({ enrollmentId }: { enrollmentId: string }) {
  const b = (await loadFrpBadges([enrollmentId]))[enrollmentId];
  if (!b) return null;
  const warn = !b.protectedNow && (b.variant === "danger" || b.variant === "warning");
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${warn ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" : "text-muted-foreground"}`}>
      {b.protectedNow ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
      <span><b>{b.label}.</b> {b.detail}</span>
    </div>
  );
}
