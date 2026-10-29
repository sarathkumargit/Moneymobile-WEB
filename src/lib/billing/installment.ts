export type InterestType = "flat" | "reducing";

export type CalcInput = {
  selling: number;       // phone price (MRP)
  deposit: number;       // down payment
  ratePct: number;       // MONTHLY interest rate %
  months: number;
  interestType: InterestType;
  charges?: number;      // fixed software fee (no interest charged on this)
};

export type CalcResult = {
  principal: number;       // financed phone amount (selling - deposit)
  totalInterest: number;
  totalRepayment: number;  // principal + interest + software fee
  monthly: number;
};

// Interest rate is MONTHLY.
//  Flat:     interest = financed principal * (monthlyRate/100) * months
//  Reducing: standard amortization using the monthly rate directly
// The software fee (charges) is added to the total WITHOUT interest.
export function calcInstallment(i: CalcInput): CalcResult {
  const selling = Math.max(i.selling || 0, 0);
  const deposit = Math.max(i.deposit || 0, 0);
  const months = Math.max(Math.floor(i.months || 0), 0);
  const rate = Math.max(i.ratePct || 0, 0);
  const charges = Math.max(i.charges || 0, 0);
  const principal = Math.max(selling - deposit, 0);

  if (months === 0) return { principal, totalInterest: 0, totalRepayment: principal + charges, monthly: 0 };

  let totalInterest: number;
  let monthly: number;
  if (i.interestType === "reducing") {
    const r = rate / 100; // already monthly
    if (r === 0) {
      monthly = (principal + charges) / months;
      totalInterest = 0;
    } else {
      const base = (principal * r) / (1 - Math.pow(1 + r, -months));
      const totalPay = base * months;
      totalInterest = totalPay - principal;
      monthly = (totalPay + charges) / months;
    }
  } else {
    totalInterest = principal * (rate / 100) * months; // monthly flat
    monthly = (principal + totalInterest + charges) / months;
  }
  const totalRepayment = principal + totalInterest + charges;
  return {
    principal: round2(principal),
    totalInterest: round2(totalInterest),
    totalRepayment: round2(totalRepayment),
    monthly: round2(monthly),
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
