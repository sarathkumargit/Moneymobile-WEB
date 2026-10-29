import { formatSL } from "@/lib/srilanka-time";
import { KeyRound, Smartphone, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveUnlockRequest } from "@/app/shop/unlocks/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Req = {
  id: string; status: string; created_at: string; imei: string | null; model: string | null;
  customer_name: string | null; reason: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
};
const sBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { pending: "warning", approved: "success", rejected: "danger" };

// Customer-raised unlock requests from the phone. Staff approve (queues UNLOCK_DEVICE) or reject.
export async function UnlockRequests({ canAct }: { canAct: boolean }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("device_unlock_requests")
    .select("id,status,created_at,imei,model,customer_name,reason, customers(full_name,phone)")
    .order("created_at", { ascending: false })
    .limit(50);
  const reqs = (data ?? []) as unknown as Req[];
  const pending = reqs.filter((r) => r.status === "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Customer unlock requests
          {pending.length > 0 && <Badge variant="warning">{pending.length} pending</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {reqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Smartphone className="h-6 w-6 text-muted-foreground" /></div>
            <p className="mt-3 font-medium">No unlock requests yet</p>
            <p className="text-sm text-muted-foreground">When a customer taps “Request unlock” on their phone, it appears here.</p>
          </div>
        ) : (
          <div className="divide-y">
            {reqs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{r.customers?.full_name ?? r.customer_name ?? "Customer"}
                    {r.customers?.phone && <span className="ml-2 text-xs text-muted-foreground">{r.customers.phone}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.model ?? "Device"}{r.imei ? ` · IMEI ${r.imei}` : ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{formatSL(r.created_at)}{r.reason ? ` · “${r.reason}”` : ""}</p>
                </div>
                {r.status === "pending" && canAct ? (
                  <div className="flex gap-2">
                    <form action={resolveUnlockRequest}><input type="hidden" name="request_id" value={r.id} /><input type="hidden" name="decision" value="approved" /><Button type="submit" size="sm">Approve &amp; unlock</Button></form>
                    <form action={resolveUnlockRequest}><input type="hidden" name="request_id" value={r.id} /><input type="hidden" name="decision" value="rejected" /><Button type="submit" size="sm" variant="outline">Reject</Button></form>
                  </div>
                ) : (
                  <Badge variant={sBadge[r.status] ?? "neutral"} className="capitalize">{r.status}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
