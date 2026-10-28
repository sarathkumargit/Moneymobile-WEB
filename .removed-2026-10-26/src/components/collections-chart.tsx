"use client";

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { collectionsSeries } from "@/lib/mock-data";

export function CollectionsChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={collectionsSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gArrears" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8"
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
        <Tooltip
          formatter={(v: number) => `Rs ${v.toLocaleString()}`}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
        />
        <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#gCollected)" name="Collected" />
        <Area type="monotone" dataKey="arrears" stroke="#f59e0b" strokeWidth={2} fill="url(#gArrears)" name="Arrears" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
