import { UserSquare, HardDrive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EmployeeOverview() {
  const supabase = createClient();
  const [customers, devices] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("devices").select("*", { count: "exact", head: true }),
  ]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My Customers" value={String(customers.count ?? 0)} icon={UserSquare} />
        <StatCard label="Assigned Devices" value={String(devices.count ?? 0)} icon={HardDrive} />
      </div>

      <Card>
        <CardHeader><CardTitle>Getting started</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your assigned customers and devices appear here. Customer registration and
            payment recording modules are coming next.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
