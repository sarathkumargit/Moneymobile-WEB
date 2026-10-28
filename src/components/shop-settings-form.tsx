"use client";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateShop, type ActionState } from "@/app/shop/settings/actions";
const initial: ActionState = {};
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>; }
export function ShopSettingsForm({ shop }: { shop: { name: string; phone: string | null; address: string | null } }) {
  const [state, action] = useFormState(updateShop, initial);
  return (<Card className="max-w-xl"><CardHeader><CardTitle>Shop details</CardTitle></CardHeader><CardContent>
    {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
    {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
    <form action={action} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="name">Shop name *</Label><Input id="name" name="name" defaultValue={shop.name} required /></div>
      <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={shop.phone ?? ""} /></div>
      <div className="space-y-1.5"><Label htmlFor="address">Address</Label><Input id="address" name="address" defaultValue={shop.address ?? ""} /></div>
      <div className="flex justify-end"><Sub /></div>
    </form>
  </CardContent></Card>);
}
