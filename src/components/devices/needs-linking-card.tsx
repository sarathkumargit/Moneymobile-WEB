import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { linkOrphanEnrollment } from "@/app/shop/device-management/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSL } from "@/lib/shared/srilanka-time";

type Orphan = { id: string; model: string | null; imei1: string | null; last_sync: string | null };
type DevRow = { id: string; brand: string | null; model: string | null; imei1: string | null; imei2: string | null; status: string | null; customer: { full_name: string } | null };

// "Needs linking": phones that are set up and checking in, but were not matched to their phone record
// (usually no IMEI could be read during setup). Pick the record and press Link — no SQL needed.
// Phones with app 1.11.4+ normally link themselves by IMEI, so this list is usually empty.
export async function NeedsLinkingCard({ orphans, connectedDeviceIds, isOwner }: { orphans: Orphan[]; connectedDeviceIds: string[]; isOwner: boolean }) {
  if (!orphans.length) return null;
  const supabase = createClient();
  const { data } = await supabase.from("devices").select("id,brand,model,imei1,imei2,status, customer:customers(full_name)").order("created_at", { ascending: false });
  const connected = new Set(connectedDeviceIds);
  const devs = ((data ?? []) as unknown as DevRow[]).filter((d) => d.status !== "released");
  // Records still waiting for their phone first (customer assigned, no connected phone).
  const waiting = devs.filter((d) => !connected.has(d.id) && d.customer);
  const rest = devs.filter((d) => !waiting.includes(d));
  const label = (d: DevRow) => `${d.customer?.full_name ? `${d.customer.full_name} — ` : ""}${[d.brand, d.model].filter(Boolean).join(" ") || "phone"}${d.imei1 ? ` · ${d.imei1}` : ""}${connected.has(d.id) ? " (already has a phone)" : ""}`;

  return (
    <Card className="border-amber-300">
      <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Needs linking <Badge variant="warning">{orphans.length}</Badge></CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">These phones are set up and checking in, but MoneyMobile couldn&apos;t match them to a phone record (usually no IMEI could be read during setup). Choose the phone record — normally the customer whose phone you just set up — and press <b>Link</b>. Lock, unlock and payments then work straight away.</p>
        {orphans.map((o) => (
          <form key={o.id} action={linkOrphanEnrollment} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center">
            <input type="hidden" name="enrollment_id" value={o.id} />
            <div className="min-w-[12rem] flex-1">
              <div className="font-medium">{o.model ?? "Phone"} {o.imei1 && <span className="font-mono text-xs text-muted-foreground">{o.imei1}</span>}</div>
              <div className="text-xs text-muted-foreground">Last check-in: {o.last_sync ? formatSL(o.last_sync) : "never"}</div>
            </div>
            <select name="device_id" required defaultValue="" className="h-9 min-w-[16rem] flex-1 rounded-md border bg-background px-2 text-sm">
              <option value="" disabled>Choose the phone record…</option>
              {waiting.length > 0 && <optgroup label="Waiting for their phone">{waiting.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}</optgroup>}
              {rest.length > 0 && <optgroup label="Other phone records">{rest.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}</optgroup>}
            </select>
            {isOwner && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Use only when you are sure: the record already has another phone checking in, or the IMEI is different (board replaced).">
                <input type="checkbox" name="force" /> Link even if it doesn&apos;t match
              </label>
            )}
            <Button type="submit" size="sm"><Link2 className="h-3.5 w-3.5" /> Link</Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
