import { formatSLDate } from "@/lib/shared/srilanka-time";
import { Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewShopForm } from "@/components/shops/new-shop-form";
import { Card, CardContent } from "@/components/ui/card";
import { ShopRow, type ShopItem } from "@/components/shops/shop-row";

export const dynamic = "force-dynamic";

type ShopRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "active" | "suspended";
  created_at: string;
  owner_id: string | null;
  license_limit?: number | null;
  owner: { full_name: string | null; username: string | null } | null;
};

export default async function ShopsPage() {
  const supabase = createClient();
  const cols = "id,name,phone,address,status,created_at,owner_id, owner:profiles!shops_owner_fk(full_name,username)";
  let res = await supabase.from("shops").select(cols + ",license_limit").order("created_at", { ascending: false });
  if (res.error) res = (await supabase.from("shops").select(cols).order("created_at", { ascending: false })) as typeof res; // migration 0018 not run yet
  const shops = (res.data ?? []) as unknown as ShopRow[];
  const usedBy: Record<string, number> = {};
  await Promise.all(shops.map(async (sh) => {
    const { count } = await supabase.from("installment_agreements").select("*", { count: "exact", head: true }).eq("shop_id", sh.id);
    usedBy[sh.id] = count ?? 0;
  }));
  const items: ShopItem[] = shops.map((s) => ({
    id: s.id, name: s.name, phone: s.phone, address: s.address, status: s.status, created: formatSLDate(s.created_at),
    ownerId: s.owner_id, ownerName: s.owner?.full_name ?? null, ownerUsername: s.owner?.username ?? null,
    licenseLimit: s.license_limit ?? null, used: usedBy[s.id] ?? 0,
  }));

  return (
    <>
      <NewShopForm />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
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
                    <th className="p-4 font-medium">Licenses</th>
                    <th className="p-4 font-medium">Created</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => <ShopRow key={s.id} shop={s} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
