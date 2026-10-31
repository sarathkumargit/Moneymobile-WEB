import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ResetPassword } from "@/components/shared/reset-password";
import { resetUserPassword } from "@/app/super-admin/shops/actions";
import { Badge } from "@/components/ui/badge";
import { DataTable, ShopFilter, Toolbar, muted } from "@/components/super-admin/parts";
import { LIMIT, loadShops, shopParam } from "@/lib/admin/platform";
import { formatSLDate } from "@/lib/shared/srilanka-time";

export const dynamic = "force-dynamic";
type Row = { id: string; full_name: string | null; username: string | null; status: string; shop_id: string | null; created_at: string };

export default async function EmployeesPage({ searchParams }: { searchParams: { shop?: string } }) {
  const supabase = createClient();
  const shop = shopParam(searchParams.shop);
  const { list, names } = await loadShops();
  let q = supabase.from("profiles").select("id,full_name,username,status,shop_id,created_at").eq("role", "employee").order("created_at", { ascending: false }).limit(LIMIT);
  if (shop) q = q.eq("shop_id", shop);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  return (
    <>
      <Toolbar title="Employees" hint={`${rows.length} across ${shop ? "this shop" : "all shops"}`}><ShopFilter shops={list} current={shop} path="/super-admin/employees" /></Toolbar>
      <DataTable icon={Users} emptyTitle="No employees yet" emptyHint="Shop owners add their employees from their own dashboard."
        cols={[{ label: "Employee" }, { label: "Username" }, { label: "Shop" }, { label: "Status" }, { label: "Joined" }, { label: "Password" }]}
        rows={rows.map((r) => [
          <span key="n" className="font-medium">{r.full_name ?? "—"}</span>,
          muted(r.username ? `@${r.username}` : null),
          r.shop_id ? names[r.shop_id] ?? "—" : "—",
          <Badge key="s" variant={r.status === "active" ? "success" : "neutral"} className="capitalize">{r.status}</Badge>,
          muted(formatSLDate(r.created_at)),
          <ResetPassword key="p" action={resetUserPassword} idName="user_id" id={r.id} />,
        ])} />
    </>
  );
}
