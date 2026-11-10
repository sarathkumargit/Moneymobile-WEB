"use client";
import { useState } from "react";
import { ShieldAlert, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Result = { imei_last4: string; financed: boolean; shop_name: string | null; shop_phone: string | null; checked_at: string };

export function ImeiCheckForm() {
  const [imei, setImei] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Result & { key_id?: string }) | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/public/imei-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imei }) });
      const j = await res.json();
      if (!j.ok) setError(j.message || "Could not check right now."); else setResult({ ...j.result, key_id: j.key_id });
    } catch { setError("No connection. Try again."); }
    setBusy(false);
  }

  return (
    <Card><CardContent className="space-y-4 p-6">
      <form onSubmit={check} className="flex gap-2">
        <Input inputMode="numeric" autoComplete="off" placeholder="15-digit IMEI" value={imei} onChange={(e) => setImei(e.target.value)} maxLength={20} aria-label="IMEI" />
        <Button type="submit" disabled={busy || imei.replace(/\D/g, "").length < 14}><Search className="h-4 w-4" />{busy ? "Checking…" : "Check"}</Button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && (result.financed ? (
        <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> Financed — do not unlock or flash</p>
          <p>The phone ending …{result.imei_last4} is under an installment agreement with <span className="font-semibold">{result.shop_name}</span>.</p>
          {result.shop_phone && <p>Please call the shop: <a className="font-semibold underline" href={`tel:${result.shop_phone}`}>{result.shop_phone}</a></p>}
        </div>
      ) : (
        <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Not found</p>
          <p>No open installment agreement for the phone ending …{result.imei_last4} in MoneyMobile shops. Other lenders may still have one.</p>
        </div>
      ))}
      {result?.key_id && <p className="text-[11px] text-muted-foreground">Signed answer · key {result.key_id} · {new Date(result.checked_at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</p>}
    </CardContent></Card>
  );
}
