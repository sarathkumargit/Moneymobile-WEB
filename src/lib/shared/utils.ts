import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "Rs") {
  return `${currency} ${value.toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}
