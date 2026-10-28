// Sample data for the prototype UI only. Replace with Supabase queries.

export const collectionsSeries = [
  { month: "May", collected: 142000, arrears: 38000 },
  { month: "Jun", collected: 168000, arrears: 41000 },
  { month: "Jul", collected: 155000, arrears: 52000 },
  { month: "Aug", collected: 189000, arrears: 47000 },
  { month: "Sep", collected: 203000, arrears: 58000 },
  { month: "Oct", collected: 176000, arrears: 58380 },
];

export type LoanRow = {
  id: number;
  customer: string;
  imei: string;
  mobile: string;
  arrears: number;
  balance: number;
  installment: number;
  due: string;
  status: "overdue" | "active" | "paid";
};

export const recentLoans: LoanRow[] = [
  { id: 8, customer: "Ramesh Bisen", imei: "350588938425352", mobile: "+94765662693", arrears: 19672.66, balance: 29509, installment: 9836.33, due: "2026-09-02", status: "overdue" },
  { id: 6, customer: "Ramkumar Dilukshan", imei: "864344070317588", mobile: "+94785554708", arrears: 33408, balance: 33408, installment: 11136, due: "2026-08-22", status: "overdue" },
  { id: 4, customer: "Suppaiya Menaga", imei: "867832085165577", mobile: "+94077942079", arrears: 4601.99, balance: 4602, installment: 4602, due: "2026-10-16", status: "overdue" },
  { id: 2, customer: "Devenran", imei: "351389785472145", mobile: "+94771605946", arrears: 696.99, balance: 697, installment: 697, due: "2026-10-11", status: "overdue" },
];

export const demoUsers = {
  super_admin: "Kalai Kamal",
  shop_admin: "Sarath Kumar",
  employee: "Priya N.",
};
