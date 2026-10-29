import { formatSLDate } from "@/lib/shared/srilanka-time";
import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewPaymentForm } from "@/components/billing/new-payment-form";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/shared/utils";
import { phoneLabelsForAgreements } from "@/lib/devices/device-snapshot";
import { deviceLabel, loadPayments } from "@/lib/devices/device-snapshot";
export const dynamic = "force-dynamic";
const PAGE_LIMIT = 200; // newest first; keeps the page fast as payment history grows
type Row = { id: string; agreement_id: string | null; device_model?: string | null; device_imei?: string | null; amount: number; method: string; reference: string | null; paid_at: string; verification: string; customers: { full_name: string } | null };
export default async function PaymentsPage() {
  const supabase = createClient();
  const [{ data: payments }, { data: agreements }] = await Promise.all([
    loadPayments(supabase, "customers(full_name)"),
    supabase.from("installment_agreements").select("id,agreement_code,outstanding_balance,status, customers(full_name)").eq("status", "active").order("created_at", { ascending: false }),
  ]);
  const rows = (payments ?? []) as unknown as Row[];
  const phones = await phoneLabelsForAgreements(supabase, rows.filter((r) => !r.device_imei).map((r) => r.agreement_id));
  const phoneOf = (r: Row) => r.device_imei || r.device_model ? deviceLabel(r.device_model, r.device_imei) : (r.agreement_id ? phones[r.agreement_id] : undefined) ?? "—";
  const agrOpts = ((agreements ?? []) as unknown as Array<{ id: string; agreement_code: string | null; outstanding_balance: number; customers: { full_name: string } | null }>).map((a) => ({ id: a.id, label: `${a.agreement_code ?? ""} · ${a.customers?.full_name ?? ""} · bal ${Number(a.outstanding_balance).toLocaleString()}` }));
  return (<>
    <NewPaymentForm agreements={agrOpts} />
    <Card><CardContent className="p-0">
      {rows.length === 0 ? (<div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><CreditCard className="h-6 w-6 text-muted-foreground" /></div><p className="mt-3 font-medium">No payments yet</p><p className="text-sm text-muted-foreground">Recorded payments reduce the agreement balance automatically.</p></div>
      ) : (<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Date</th><th className="p-4 font-medium">Customer</th><th className="p-4 font-medium">Phone (IMEI)</th><th className="p-4 font-medium">Method</th><th className="p-4 font-medium">Reference</th><th className="p-4 font-medium text-right">Amount</th><th className="p-4 font-medium">Status</th></tr></thead><tbody>
        {rows.map((r) => (<tr key={r.id} className="border-b last:border-0"><td className="p-4 text-muted-foreground">{formatSLDate(r.paid_at)}</td><td className="p-4 font-medium">{r.customers?.full_name ?? "—"}</td><td className="p-4 text-xs text-muted-foreground">{phoneOf(r)}</td><td className="p-4 capitalize text-muted-foreground">{r.method.replace(/_/g, " ")}</td><td className="p-4 text-muted-foreground">{r.reference ?? "—"}</td><td className="p-4 text-right font-semibold">{formatCurrency(Number(r.amount))}</td><td className="p-4"><Badge variant="success" className="capitalize">{r.verification}</Badge></td></tr>))}
      </tbody></table></div>)}
      {rows.length >= PAGE_LIMIT && <p className="border-t p-3 text-center text-xs text-muted-foreground">Showing the latest {PAGE_LIMIT} payments.</p>}
    </CardContent></Card>
  </>);
}
