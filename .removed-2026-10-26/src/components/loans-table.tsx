import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recentLoans } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const statusVariant = {
  overdue: "danger",
  active: "success",
  paid: "neutral",
} as const;

export function LoansTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent installment accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Loan</th>
                <th className="pb-2 pr-4 font-medium">Customer</th>
                <th className="pb-2 pr-4 font-medium">IMEI</th>
                <th className="pb-2 pr-4 font-medium text-right">Arrears</th>
                <th className="pb-2 pr-4 font-medium text-right">Balance</th>
                <th className="pb-2 pr-4 font-medium text-right">Installment</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLoans.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-semibold">#{l.id}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{l.customer}</div>
                    <div className="text-xs text-muted-foreground">{l.mobile}</div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{l.imei}</td>
                  <td className="py-3 pr-4 text-right font-semibold">{formatCurrency(l.arrears)}</td>
                  <td className="py-3 pr-4 text-right">{formatCurrency(l.balance)}</td>
                  <td className="py-3 pr-4 text-right">
                    <div>{formatCurrency(l.installment)}</div>
                    <div className="text-xs text-muted-foreground">{l.due}</div>
                  </td>
                  <td className="py-3">
                    <Badge variant={statusVariant[l.status]} className="capitalize">{l.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
