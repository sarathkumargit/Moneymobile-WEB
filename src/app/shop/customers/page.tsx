import { UserSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NewCustomerForm } from "@/components/customers/new-customer-form";
import { assignCustomer } from "@/app/shop/customers/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Row = {
  id: string; full_name: string; national_id: string | null; phone: string | null;
  verification: "pending" | "verified" | "rejected"; created_at: string;
  assigned_employee_id: string | null; assigned: { full_name: string | null } | null;
};
const vBadge = { verified: "success", pending: "warning", rejected: "danger" } as const;

export default async function CustomersPage() {
  const supabase = createClient();
  const [{ data }, { data: employees }] = await Promise.all([
    supabase.from("customers")
      .select("id,full_name,national_id,phone,verification,created_at,assigned_employee_id, assigned:profiles!customers_assigned_employee_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name").eq("role", "employee").order("full_name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const emps = (employees ?? []) as { id: string; full_name: string | null }[];

  return (
    <>
      <NewCustomerForm />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><UserSquare className="h-6 w-6 text-muted-foreground" /></div>
              <p className="mt-3 font-medium">No customers yet</p>
              <p className="text-sm text-muted-foreground">Register your first customer to start an installment agreement.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Name</th>
                    <th className="p-4 font-medium">NIC</th>
                    <th className="p-4 font-medium">Phone</th>
                    <th className="p-4 font-medium">Verification</th>
                    <th className="p-4 font-medium">Assigned to</th>
                    <th className="p-4 font-medium">Reassign</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-4 font-medium"><Link href={`/shop/customers/${r.id}`} className="text-primary hover:underline">{r.full_name}</Link></td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{r.national_id ?? "—"}</td>
                      <td className="p-4 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="p-4"><Badge variant={vBadge[r.verification]} className="capitalize">{r.verification}</Badge></td>
                      <td className="p-4 text-muted-foreground">{r.assigned?.full_name ?? "—"}</td>
                      <td className="p-4">
                        <form action={assignCustomer} className="flex items-center gap-2">
                          <input type="hidden" name="customer_id" value={r.id} />
                          <select name="employee_id" defaultValue={r.assigned_employee_id ?? ""} className={selectCls}>
                            <option value="">— unassigned —</option>
                            {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name ?? "employee"}</option>)}
                          </select>
                          <Button type="submit" size="sm" variant="outline">Assign</Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {emps.length === 0 && <p className="text-xs text-muted-foreground">Tip: create employees first (Employees page) to assign customers to them.</p>}
    </>
  );
}
