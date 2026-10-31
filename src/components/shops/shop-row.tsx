"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResetPassword } from "@/components/shared/reset-password";
import { updateShop, deleteShop, resetUserPassword } from "@/app/super-admin/shops/actions";

export type ShopItem = {
  id: string; name: string; phone: string | null; address: string | null; status: "active" | "suspended";
  created: string; ownerId: string | null; ownerName: string | null; ownerUsername: string | null;
  licenseLimit: number | null; used: number;
};

function Save() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>; }
const Msg = ({ s }: { s: { error?: string; success?: string } }) => (
  <>{s.error && <p className="text-xs text-red-600">{s.error}</p>}{s.success && <p className="text-xs text-emerald-600">{s.success}</p>}</>
);

export function ShopRow({ shop }: { shop: ShopItem }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editState, editAction] = useFormState(updateShop, {});
  const [delState, delAction] = useFormState(deleteShop, {});
  const full = shop.licenseLimit !== null && shop.used >= shop.licenseLimit;
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="p-4"><div className="font-medium">{shop.name}</div>{shop.address && <div className="text-xs text-muted-foreground">{shop.address}</div>}</td>
        <td className="p-4"><div>{shop.ownerName ?? "—"}</div>{shop.ownerUsername && <div className="text-xs text-muted-foreground">@{shop.ownerUsername}</div>}</td>
        <td className="p-4 text-muted-foreground">{shop.phone ?? "—"}</td>
        <td className="p-4">
          <Badge variant={full ? "danger" : "neutral"}>{shop.used} / {shop.licenseLimit ?? "∞"}</Badge>
        </td>
        <td className="p-4 text-muted-foreground">{shop.created}</td>
        <td className="p-4"><Badge variant={shop.status === "active" ? "success" : "danger"} className="capitalize">{shop.status}</Badge></td>
        <td className="p-4"><Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}><Pencil className="h-3.5 w-3.5" /> Manage</Button></td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30">
          <td colSpan={7} className="space-y-4 p-4">
            <form action={editAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="shop_id" value={shop.id} />
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Shop name</label><Input name="name" defaultValue={shop.name} required className="h-9" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Phone</label><Input name="phone" defaultValue={shop.phone ?? ""} className="h-9" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Address</label><Input name="address" defaultValue={shop.address ?? ""} className="h-9" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Licenses (empty = unlimited)</label><Input name="license_limit" type="number" min={0} defaultValue={shop.licenseLimit ?? ""} className="h-9 w-40" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
                <select name="status" defaultValue={shop.status} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
              <Save />
            </form>
            <Msg s={editState} />
            {shop.ownerId && (
              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <span className="text-sm text-muted-foreground">Owner login ({shop.ownerName ?? "owner"}):</span>
                <ResetPassword action={resetUserPassword} idName="user_id" id={shop.ownerId} />
              </div>
            )}
            <div className="border-t pt-3">
              <Msg s={delState} />
              {!confirmDel ? (
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5" /> Delete shop</Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">Delete {shop.name} and its logins? Only works if it has no agreements or phones.</span>
                  <form action={delAction}><input type="hidden" name="shop_id" value={shop.id} /><Button type="submit" size="sm" variant="destructive">Yes, delete</Button></form>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>Cancel</Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
