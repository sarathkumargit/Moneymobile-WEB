import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/shared/utils";
import { phoneLabelsForAgreements } from "@/lib/devices/device-snapshot";
export const dynamic = "force-dynamic";
type Row = { id: string; agreement_code: string | null; total_price: number; outstanding_balance: number; installment_amount: number; status: string; customers: { full_name: string } | null };
const sBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { active: "success", completed: "neutral", defaulted: "danger", released: "neutral", cancelled: "neutral", draft: "warning" };
export default async function EmployeeInstallmentsPage() {
  const supabase = createClient();
  // customers!inner keeps only agreements whose customer this employee can read (RLS) — one query
  // instead of fetching the employee's customer ids first.
  const { data } = await supabase
    .from("installment_agreements")
    .select("id,agreement_code,total_price,outstanding_balance,installment_amount,status, customers!inner(full_name)")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const phones = await phoneLabelsForAgreements(supabase, rows.map((r) => r.id));
  return (<Card><CardContent className="p-0">
    {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><FileText className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No agreements for your customers yet</p></div>
    ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Code</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Phone (IMEI)</th><th className="p-4 font-medium text-right">Total</th><th className="p-4 font-medium text-right">Outstanding</th><th className="p-4 font-medium text-right">Installment</th><th className="p-4 font-medium">Status</th></tr></thead><tbody>
      {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-mono text-xs">{r.agreement_code ?? "—"}</td><td className="p-4 font-medium">{r.customers?.full_name ?? "—"}</td><td className="p-4 text-xs text-muted-foreground">{phones[r.id] ?? "—"}</td><td className="p-4 text-right">{formatCurrency(Number(r.total_price))}</td><td className="p-4 text-right font-semibold">{formatCurrency(Number(r.outstanding_balance))}</td><td className="p-4 text-right">{formatCurrency(Number(r.installment_amount))}</td><td className="p-4"><Badge variant={sBadge[r.status] ?? "neutral"} className="capitalize">{r.status}</Badge></td></tr>))}
    </tbody></table></div>)}
  </CardContent></Card>);
}
