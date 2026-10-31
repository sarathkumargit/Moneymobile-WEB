import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam, words } from "@/lib/admin/platform";
import { formatSL } from "@/lib/shared/srilanka-time";

export const dynamic = "force-dynamic";
type Row = { id: string; shop_id: string | null; actor_id: string | null; action: string; entity: string | null; entity_id: string | null; details: unknown; created_at: string };

function brief(d: unknown): string {
  if (d == null) return "";
  const s = typeof d === "string" ? d : JSON.stringify(d);
  return s === "{}" ? "" : s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

export default async function AuditPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let q = supabase.from("audit_logs").select("id,shop_id,actor_id,action,entity,entity_id,details,created_at").order("created_at", { ascending: false }).limit(LIMIT);
  if (shop) q = q.eq("shop_id", shop);
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  // Who did it: look the actors up once.
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const actors: Record<string, string> = {};
  if (actorIds.length) {
    const { data: ps } = await supabase.from("profiles").select("id,full_name,username").in("id", actorIds);
    ((ps ?? []) as { id: string; full_name: string | null; username: string | null }[]).forEach((p) => { actors[p.id] = p.full_name || (p.username ? `@${p.username}` : "user"); });
  }

  return (
    <>
      <Toolbar title="Audit log" hint="Every important action by shop staff, newest first"><ShopFilter shops={list} current={shop} path="/super-admin/audit" /></Toolbar>
      <DataTable icon={ScrollText} emptyTitle="Nothing logged yet" emptyHint="Actions like payments, unlocks and device changes appear here."
        cols={[{ label: "When" }, { label: "Shop" }, { label: "Who" }, { label: "Action" }, { label: "Details" }]}
        rows={rows.map((r) => [
          muted(formatSL(r.created_at)),
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          r.actor_id ? actors[r.actor_id] ?? "—" : muted("phone / system"),
          <div key="a"><div className="font-medium capitalize">{words(r.action)}</div>{r.entity && <div className="text-xs text-muted-foreground">{words(r.entity)}</div>}</div>,
          <span key="d" className="font-mono text-xs text-muted-foreground">{brief(r.details) || "—"}</span>,
        ])} />
    </>
  );
}
