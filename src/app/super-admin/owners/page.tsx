import { UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { ResetPassword } from "@/components/shared/reset-password";
import { resetUserPassword } from "@/app/super-admin/shops/actions";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type OwnerRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  status: "active" | "disabled";
  shop: { name: string } | null;
};

export default async function OwnersPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,username,status, shop:shops!profiles_shop_id_fkey(name)")
    .eq("role", "shop_admin")
    .order("created_at", { ascending: false });
  const owners = (data ?? []) as unknown as OwnerRow[];

  return (
    <Card>
      <CardContent className="p-0">
        {owners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <UserCog className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 font-medium">No shop owners yet</p>
            <p className="text-sm text-muted-foreground">Create a shop (with its owner) from the Shops page.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Owner</th>
                  <th className="p-4 font-medium">Username</th>
                  <th className="p-4 font-medium">Shop</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Password</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{o.full_name ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{o.username ? `@${o.username}` : "—"}</td>
                    <td className="p-4">{o.shop?.name ?? "—"}</td>
                    <td className="p-4">
                      <Badge variant={o.status === "active" ? "success" : "neutral"} className="capitalize">{o.status}</Badge>
                    </td>
                    <td className="p-4"><ResetPassword action={resetUserPassword} idName="user_id" id={o.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
