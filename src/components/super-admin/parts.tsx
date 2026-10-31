import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { LIMIT, type ShopRef } from "@/lib/admin/platform";

const selectCls = "h-9 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Plain GET form (no JavaScript needed): picks one shop, or all of them.
export function ShopFilter({ shops, current, path }: { shops: ShopRef[]; current: string | null; path: string }) {
  return (
    <form method="get" action={path} className="flex flex-wrap items-center gap-2">
      <label htmlFor="shop" className="text-sm text-muted-foreground">Shop</label>
      <select id="shop" name="shop" defaultValue={current ?? ""} className={selectCls}>
        <option value="">All shops</option>
        {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Button type="submit" size="sm" variant="outline">Filter</Button>
      {current && <Link href={path} className="text-sm text-primary hover:underline">Clear</Link>}
    </form>
  );
}

// Heading line above a table: what it is + the shop filter.
export function Toolbar({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export type Col = { label: string; align?: "right" };

export function DataTable({ cols, rows, icon: Icon, emptyTitle, emptyHint }: {
  cols: Col[]; rows: React.ReactNode[][]; icon: LucideIcon; emptyTitle: string; emptyHint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Icon className="h-6 w-6 text-muted-foreground" /></div>
            <p className="mt-3 font-medium">{emptyTitle}</p>
            {emptyHint && <p className="text-sm text-muted-foreground">{emptyHint}</p>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {cols.map((c) => <th key={c.label} className={cn("p-4 font-medium", c.align === "right" && "text-right")}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((cells, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {cells.map((cell, j) => <td key={j} className={cn("p-4", cols[j]?.align === "right" && "text-right")}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length >= LIMIT && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing the newest {LIMIT}. Use the shop filter to narrow it down.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const muted = (v: React.ReactNode) => <span className="text-muted-foreground">{v ?? "—"}</span>;
