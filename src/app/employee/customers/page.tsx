import { formatSLDate } from "@/lib/srilanka-time";
import { UserSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NewCustomerForm } from "@/components/customers/new-customer-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Row = {
  id: string; full_name: string; national_id: string | null; phone: string | null;
  verification: "pending" | "verified" | "rejected"; created_at: string;
};
const vBadge = { verified: "success", pending: "warning", rejected: "danger" } as const;

export default async function EmployeeCustomersPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("id,full_name,national_id,phone,verification,created_at")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <>
      <NewCustomerForm />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><UserSquare className="h-6 w-6 text-muted-foreground" /></div>
              <p className="mt-3 font-medium">No customers yet</p>
              <p className="text-sm text-muted-foreground">Register a customer to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Name</th>
                    <th className="p-4 font-medium">NIC</th>
                    <th className="p-4 font-medium">Phone</th>
                    <th className="p-4 font-medium">Registered</th>
                    <th className="p-4 font-medium">Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-4 font-medium"><Link href={`/employee/customers/${r.id}`} className="text-primary hover:underline">{r.full_name}</Link></td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{r.national_id ?? "—"}</td>
                      <td className="p-4 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="p-4 text-muted-foreground">{formatSLDate(r.created_at)}</td>
                      <td className="p-4"><Badge variant={vBadge[r.verification]} className="capitalize">{r.verification}</Badge></td>
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
