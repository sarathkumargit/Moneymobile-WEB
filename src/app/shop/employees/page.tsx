import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewEmployeeForm } from "@/components/new-employee-form";
import { EmployeeRow } from "@/components/employee-row";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Row = { id: string; full_name: string | null; username: string | null; status: "active" | "disabled" };

export default async function EmployeesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,username,status")
    .eq("role", "employee")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <>
      <NewEmployeeForm />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Users className="h-6 w-6 text-muted-foreground" /></div>
              <p className="mt-3 font-medium">No employees yet</p>
              <p className="text-sm text-muted-foreground">Create logins for your staff to let them register customers.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Name</th>
                    <th className="p-4 font-medium">Username</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => <EmployeeRow key={r.id} emp={r} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
