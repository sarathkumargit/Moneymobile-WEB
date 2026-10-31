import { HardDrive, MonitorSmartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam, words } from "@/lib/admin/platform";
import { formatSL } from "@/lib/shared/srilanka-time";

export const dynamic = "force-dynamic";
type Dev = { id: string; brand: string | null; model: string | null; imei1: string | null; status: string; shop_id: string | null; customer: { full_name: string | null } | null };
type Enr = { id: string; status: string; model: string | null; imei1: string | null; battery_level: number | null; last_sync: string | null; app_version: string | null; shop_id: string | null; customer: { full_name: string | null } | null };
const ONLINE_MS = 5 * 60 * 1000;

export default async function DevicesPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let dq = supabase.from("devices").select("id,brand,model,imei1,status,shop_id, customer:customers(full_name)").order("created_at", { ascending: false }).limit(LIMIT);
  let eq = supabase.from("device_enrollments").select("id,status,model,imei1,battery_level,last_sync,app_version,shop_id, customer:customers(full_name)").order("last_sync", { ascending: false, nullsFirst: false }).limit(LIMIT);
  if (shop) { dq = dq.eq("shop_id", shop); eq = eq.eq("shop_id", shop); }
  const [{ data: devs }, { data: enrs }] = await Promise.all([dq, eq]);
  const devices = (devs ?? []) as unknown as Dev[];
  const enrollments = (enrs ?? []) as unknown as Enr[];
  const now = Date.now();

  return (
    <>
      <Toolbar title="Registered phones" hint={`${devices.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/devices" /></Toolbar>
      <DataTable icon={HardDrive} emptyTitle="No phones registered yet"
        cols={[{ label: "Phone" }, { label: "IMEI" }, { label: "Shop" }, { label: "Customer" }, { label: "Status" }]}
        rows={devices.map((d) => [
          <span key="p" className="font-medium">{`${d.brand ?? ""} ${d.model ?? ""}`.trim() || "—"}</span>,
          <span key="i" className="font-mono text-xs text-muted-foreground">{d.imei1 ?? "—"}</span>,
          d.shop_id ? names[d.shop_id] ?? "—" : "—",
          muted(d.customer?.full_name),
          <Badge key="s" variant="neutral" className="capitalize">{words(d.status)}</Badge>,
        ])} />

      <Toolbar title="Phones with the app installed" hint="Live check-in from the MoneyMobile app. Older app versions need the new setup file." />
      <DataTable icon={MonitorSmartphone} emptyTitle="No phones are running the app yet"
        cols={[{ label: "Phone" }, { label: "IMEI" }, { label: "Shop" }, { label: "Customer" }, { label: "App" }, { label: "Battery" }, { label: "Last check-in" }]}
        rows={enrollments.map((e) => {
          const t = e.last_sync ? new Date(e.last_sync).getTime() : 0;
          const online = t > 0 && now - t < ONLINE_MS;
          return [
            <span key="p" className="font-medium">{e.model ?? "—"}</span>,
            <span key="i" className="font-mono text-xs text-muted-foreground">{e.imei1 ?? "—"}</span>,
            e.shop_id ? names[e.shop_id] ?? "—" : "—",
            muted(e.customer?.full_name),
            muted(e.app_version ? `v${e.app_version}` : null),
            muted(e.battery_level != null ? `${e.battery_level}%` : null),
            <div key="l" className="flex items-center gap-2">
              <Badge variant={e.status === "released" ? "neutral" : online ? "success" : "warning"}>{e.status === "released" ? "Released" : online ? "Online" : "Offline"}</Badge>
              <span className="text-xs text-muted-foreground">{e.last_sync ? formatSL(e.last_sync) : "never"}</span>
            </div>,
          ];
        })} />
    </>
  );
}
