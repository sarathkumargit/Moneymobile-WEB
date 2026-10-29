import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AgreementCalculatorForm } from "@/components/billing/agreement-calculator-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/shared/utils";
import { phoneLabelsForAgreements } from "@/lib/devices/device-snapshot";
export const dynamic = "force-dynamic";
type Row = { id: string; agreement_code: string | null; total_price: number; outstanding_balance: number; installment_amount: number; total_repayment: number | null; installment_months: number | null; status: string; customers: { full_name: string } | null };
const sBadge: Record<string, "success" | "warning" | "danger" | "neutral"> = { active: "success", completed: "neutral", defaulted: "danger", released: "neutral", cancelled: "neutral", draft: "warning" };
export default async function InstallmentsPage() {
  const supabase = createClient();
  const [{ data: agreements }, { data: customers }, { data: devices }] = await Promise.all([
    supabase.from("installment_agreements").select("id,agreement_code,total_price,outstanding_balance,installment_amount,total_repayment,installment_months,status, customers(full_name)").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,full_name").order("full_name"),
    supabase.from("devices").select("id,brand,model,imei1").order("created_at", { ascending: false }),
  ]);
  const rows = (agreements ?? []) as unknown as Row[];
  const phones = await phoneLabelsForAgreements(supabase, rows.map((r) => r.id));
  const deviceOpts = (devices ?? []).map((d: { id: string; brand: string | null; model: string | null; imei1: string | null }) => ({ id: d.id, label: `${d.brand ?? ""} ${d.model ?? ""}${d.imei1 ? ` · ${d.imei1}` : ""}` }));
  return (<>
    <AgreementCalculatorForm customers={(customers ?? []) as { id: string; full_name: string }[]} devices={deviceOpts} />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><FileText className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No agreements yet</p><p className="text-sm text-muted-foreground">Create an installment agreement with the calculator above.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Code</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Phone (IMEI)</th><th className="p-4 font-medium text-right">Price</th><th className="p-4 font-medium text-right">Monthly</th><th className="p-4 font-medium text-right">Total</th><th className="p-4 font-medium text-right">Outstanding</th><th className="p-4 font-medium">Status</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 font-mono text-xs">{r.agreement_code ?? "—"}</td><td className="p-4 font-medium">{r.customers?.full_name ?? "—"}</td><td className="p-4 text-xs text-muted-foreground">{phones[r.id] ?? "—"}</td><td className="p-4 text-right">{formatCurrency(Number(r.total_price))}</td><td className="p-4 text-right">{formatCurrency(Number(r.installment_amount))}<div className="text-xs text-muted-foreground">× {r.installment_months ?? 0}</div></td><td className="p-4 text-right">{formatCurrency(Number(r.total_repayment ?? 0))}</td><td className="p-4 text-right font-semibold">{formatCurrency(Number(r.outstanding_balance))}</td><td className="p-4"><Badge variant={sBadge[r.status] ?? "neutral"} className="capitalize">{r.status}</Badge></td></tr>))}
      </tbody></table></div>)}
    </CardContent></Card>
  </>);
}
