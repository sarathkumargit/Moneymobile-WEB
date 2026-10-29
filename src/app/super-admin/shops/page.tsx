import { formatSLDate } from "@/lib/srilanka-time";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewShopForm } from "@/components/new-shop-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type ShopRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "active" | "suspended";
  created_at: string;
  owner: { full_name: string | null; username: string | null } | null;
};

export default async function ShopsPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("shops")
    .select("id,name,phone,address,status,created_at, owner:profiles!shops_owner_fk(full_name,username)")
    .order("created_at", { ascending: false });
  const shops = (data ?? []) as unknown as ShopRow[];

  return (
    <>
      <NewShopForm />

      <Card>
        <CardContent className="p-0">
          {shops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Store className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 font-medium">No shops yet</p>
              <p className="text-sm text-muted-foreground">Create your first shop and its owner to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Shop</th>
                    <th className="p-4 font-medium">Owner</th>
                    <th className="p-4 font-medium">Phone</th>
                    <th className="p-4 font-medium">Created</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-4">
                        <div className="font-medium">{s.name}</div>
                        {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                      </td>
                      <td className="p-4">
                        <div>{s.owner?.full_name ?? "—"}</div>
                        {s.owner?.username && <div className="text-xs text-muted-foreground">@{s.owner.username}</div>}
                      </td>
                      <td className="p-4 text-muted-foreground">{s.phone ?? "—"}</td>
                      <td className="p-4 text-muted-foreground">{formatSLDate(s.created_at)}</td>
                      <td className="p-4">
                        <Badge variant={s.status === "active" ? "success" : "danger"} className="capitalize">{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
