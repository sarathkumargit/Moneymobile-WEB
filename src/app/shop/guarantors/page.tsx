import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewGuarantorForm } from "@/components/customers/new-guarantor-form";
import { Card, CardContent } from "@/components/ui/card";
export const dynamic = "force-dynamic";
type Row = { id: string; full_name: string; national_id: string | null; phone: string | null; relationship: string | null };
export default async function GuarantorsPage() {
  const supabase = createClient();
  const { data } = await supabase.from("guarantors").select("id,full_name,national_id,phone,relationship").order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  return (<>
    <NewGuarantorForm />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><ShieldCheck className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No guarantors yet</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Name</th><th className="p-4 font-medium">NIC</th><th className="p-4 font-medium">Phone</th><th className="p-4 font-medium">Relationship</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-medium">{r.full_name}</td><td className="p-4 font-mono text-xs text-muted-foreground">{r.national_id ?? "—"}</td><td className="p-4 text-muted-foreground">{r.phone ?? "—"}</td><td className="p-4 text-muted-foreground">{r.relationship ?? "—"}</td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
