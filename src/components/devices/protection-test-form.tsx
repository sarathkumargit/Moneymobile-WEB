"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addProtectionTest, type ActionState } from "@/app/shop/protection-tests/actions";

const initial: ActionState = {};
const selectCls = "flex h-11 w-full rounded-xl border border-transparent bg-secondary px-3.5 py-2 text-[15px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20";
function Sub() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save test"}</Button>; }

/** Record one unlock / flash test. `models` = phones the shop already has, offered as suggestions. */
export function ProtectionTestForm({ models }: { models: { brand: string; model: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addProtectionTest, initial);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); // Sri Lanka date

  if (!open) return <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record a test</Button></div>;
  const brands = Array.from(new Set(models.map((m) => m.brand)));
  const modelsForBrand = models.filter((m) => !brand || m.brand.toLowerCase() === brand.toLowerCase()).map((m) => m.model);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Record an unlock test</CardTitle>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-5 w-5" /></button></CardHeader>
      <CardContent>
        {state.success && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{state.success}</div>}
        {state.error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="brand">Brand *</Label>
              <Input id="brand" name="brand" list="mpt-brands" placeholder="samsung" value={brand} onChange={(e) => setBrand(e.target.value)} required />
              <datalist id="mpt-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist></div>
            <div className="space-y-1.5"><Label htmlFor="model">Model *</Label>
              <Input id="model" name="model" list="mpt-models" placeholder="SM-M175F" value={model} onChange={(e) => setModel(e.target.value)} required />
              <datalist id="mpt-models">{modelsForBrand.map((m) => <option key={m} value={m} />)}</datalist>
              <p className="text-xs text-muted-foreground">Use the model code the phone reports (as shown on Devices), so agreements match it.</p></div>
            <div className="space-y-1.5"><Label htmlFor="tested_at">Test date</Label><Input id="tested_at" name="tested_at" type="date" defaultValue={today} max={today} /></div>
            <div className="space-y-1.5"><Label htmlFor="android_version">Android version</Label><Input id="android_version" name="android_version" placeholder="15" /></div>
            <div className="space-y-1.5"><Label htmlFor="security_patch">Security patch</Label><Input id="security_patch" name="security_patch" type="date" /><p className="text-xs text-muted-foreground">Settings → About phone → Software information</p></div>
            <div className="space-y-1.5"><Label htmlFor="method">What did you try? *</Label>
              <select id="method" name="method" className={selectCls} required defaultValue="">
                <option value="" disabled>— choose —</option>
                <option value="recovery_reset">Power + Volume factory reset</option>
                <option value="frp_tool">FRP unlock tool (Google account bypass)</option>
                <option value="firmware_flash">Firmware flash with a tool</option>
                <option value="mdm_tool">MDM / lock remover tool</option>
                <option value="other">Other</option>
              </select></div>
            <div className="space-y-1.5"><Label htmlFor="tool_name">Tool name</Label><Input id="tool_name" name="tool_name" placeholder="e.g. UnlockTool, Odin, SP Flash Tool" /></div>
            <div className="space-y-1.5"><Label htmlFor="tool_version">Tool version</Label><Input id="tool_version" name="tool_version" placeholder="2026.11.01" /></div>
            <div className="space-y-1.5"><Label>Result *</Label>
              <div className="flex h-11 items-center gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="result" value="held" required /> Protection held</label>
                <label className="flex items-center gap-2"><input type="radio" name="result" value="bypassed" /> Tool bypassed it</label>
              </div></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><textarea id="notes" name="notes" rows={3} maxLength={1000} placeholder="Exact error message, what happened after the reset, etc." className="flex w-full rounded-xl border border-transparent bg-secondary px-3.5 py-2 text-[15px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20" /></div>
            <div className="space-y-1.5"><Label htmlFor="photo">Photo of the tool / phone screen</Label><Input id="photo" name="photo" type="file" accept="image/*" /><p className="text-xs text-muted-foreground">Optional, up to 10 MB.</p></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button><Sub /></div>
        </form>
      </CardContent>
    </Card>
  );
}
