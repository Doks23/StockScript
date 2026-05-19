import { format } from "date-fns";

// Currency amount (₹) — absolute money values, no decimals.
export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

// Percentage — one decimal place.
export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

// Generic absolute number (quantities, capital, charges, P&L without ₹ symbol).
// No decimals.
export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

// Stock prices — always two decimals.
export function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Ratios like profit factor — two decimals.
export function formatRatio(value: number) {
  return value.toFixed(2);
}

export function formatDateTime(value: Date | string) {
  return format(new Date(value), "dd MMM yyyy, hh:mm a");
}

export function formatDateValue(value: Date | string) {
  return format(new Date(value), "dd MMM yyyy");
}
