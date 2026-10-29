"use client";
import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAgreement, type ActionState } from "@/app/shop/installments/actions";
import { calcInstallment } from "@/lib/billing/installment";
import { formatCurrency } from "@/lib/shared/utils";

const initial: ActionState = {};
const DEFAULT_SOFTWARE_FEE = "3500";
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create agreement"}</Button>; }

export function AgreementCalculatorForm({ customers = [], devices, fixedCustomer }: { customers?: { id: string; full_name: string }[]; devices: { id: string; label: string }[]; fixedCustomer?: { id: string; full_name: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createAgreement, initial);
  const [selling, setSelling] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [rate, setRate] = useState("0");
  const [months, setMonths] = useState("12");
  const [softwareFee, setSoftwareFee] = useState(DEFAULT_SOFTWARE_FEE);

  // Always flat monthly interest; software fee is a fixed add-on with no interest.
  const r = useMemo(() => calcInstallment({
    selling: Number(selling) || 0, deposit: Number(deposit) || 0, ratePct: Number(rate) || 0,
    months: Number(months) || 0, interestType: "flat", charges: Number(softwareFee) || 0,
  }), [selling, deposit, rate, months, softwareFee]);

  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New agreement</Button></div>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>New installment agreement</CardTitle>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button></CardHeader>
      <CardContent>
        {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
        {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
        {customers.length === 0 && !fixedCustomer ? <p className="text-sm text-muted-foreground">Register a customer first.</p> : (
        <form action={action} className="space-y-5">
          {/* flat interest; the server recomputes authoritatively */}
          <input type="hidden" name="interest_type" value="flat" />
          <input type="hidden" name="frequency" value="monthly" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fixedCustomer ? (
              <div className="space-y-1.5"><Label>Customer</Label><input type="hidden" name="customer_id" value={fixedCustomer.id} /><div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm font-medium">{fixedCustomer.full_name}</div></div>
            ) : (
              <div className="space-y-1.5"><Label htmlFor="customer_id">Customer *</Label><select id="customer_id" name="customer_id" className={selectCls} required><option value="">— select —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div>
            )}
            <div className="space-y-1.5"><Label htmlFor="device_id">Device</Label><select id="device_id" name="device_id" className={selectCls}><option value="">— none —</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="total_price">Phone price (Rs) *</Label><Input id="total_price" name="total_price" type="number" step="0.01" value={selling} onChange={(e) => setSelling(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="additional_charges">Software fee (Rs)</Label><Input id="additional_charges" name="additional_charges" type="number" step="0.01" value={softwareFee} onChange={(e) => setSoftwareFee(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="deposit">Down payment (Rs)</Label><Input id="deposit" name="deposit" type="number" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="interest_rate">Monthly interest %</Label><Input id="interest_rate" name="interest_rate" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /><p className="text-xs text-muted-foreground">0 = interest-free</p></div>
            <div className="space-y-1.5"><Label htmlFor="installment_months">Installment months</Label><Input id="installment_months" name="installment_months" type="number" value={months} onChange={(e) => setMonths(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="first_due_date">First due date &amp; time</Label><Input id="first_due_date" name="first_due_date" type="datetime-local" /><p className="text-xs text-muted-foreground">Sri Lanka time — the phone locks when this moment passes (plus grace)</p></div>
            <div className="space-y-1.5"><Label htmlFor="grace_days">Grace days</Label><Input id="grace_days" name="grace_days" type="number" defaultValue="3" min="0" /><p className="text-xs text-muted-foreground">Days after a due date before the phone auto-locks</p></div>
          </div>

          {/* compact total — not a calculator, just the resulting figures */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">Financed: <span className="font-medium text-foreground">{formatCurrency(r.principal)}</span></span>
              <span className="text-muted-foreground">Interest: <span className="font-medium text-foreground">{formatCurrency(r.totalInterest)}</span></span>
              <span className="text-muted-foreground">Software fee: <span className="font-medium text-foreground">{formatCurrency(Number(softwareFee) || 0)}</span></span>
              <span className="text-muted-foreground">Total: <span className="font-bold text-foreground">{formatCurrency(r.totalRepayment)}</span></span>
            </div>
            <div className="rounded-lg bg-primary/10 px-4 py-2 text-center">
              <p className="text-xs text-muted-foreground">Monthly</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(r.monthly)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div>
        </form>)}
      </CardContent>
    </Card>
  );
}
