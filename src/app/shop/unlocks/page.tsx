import { formatSL, formatSLTime } from "@/lib/srilanka-time";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewUnlockForm } from "@/components/new-unlock-form";
import { UnlockRequests } from "@/components/unlock-requests";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export const dynamic = "force-dynamic";
type Row = { id: string; status: string; expires_at: string; created_at: string; devices: { brand: string | null; model: string | null; imei1: string | null } | null };
const kBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { unused: "success", redeemed: "neutral", expired: "warning", revoked: "danger" };
export default async function UnlocksPage() {
  const supabase = createClient();
  const [{ data: keys }, { data: devices }] = await Promise.all([
    supabase.from("temporary_unlock_keys").select("id,status,expires_at,created_at, devices(brand,model,imei1)").order("created_at", { ascending: false }),
    supabase.from("devices").select("id,brand,model,imei1").order("created_at", { ascending: false }),
  ]);
  const rows = (keys ?? []) as unknown as Row[];
  const devOpts = (devices ?? []).map((d: { id: string; brand: string | null; model: string | null; imei1: string | null }) => ({ id: d.id, label: `${d.brand ?? ""} ${d.model ?? ""}${d.imei1 ? ` · ${d.imei1}` : ""}` }));
  return (<>
    <UnlockRequests canAct />
    <NewUnlockForm devices={devOpts} />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><KeyRound className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No unlock keys yet</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Device</th><th className="p-4 font-medium">Created</th><th className="p-4 font-medium">Expires</th><th className="p-4 font-medium">Status</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-medium">{r.devices ? `${r.devices.brand ?? ""} ${r.devices.model ?? ""}` : "—"}<div className="font-mono text-xs text-muted-foreground">{r.devices?.imei1 ?? ""}</div></td><td className="p-4 text-muted-foreground">{formatSL(r.created_at)}</td><td className="p-4 text-muted-foreground">{formatSLTime(r.expires_at)}</td><td className="p-4"><Badge variant={kBadge[r.status] ?? "neutral"} className="capitalize">{r.status}</Badge></td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
