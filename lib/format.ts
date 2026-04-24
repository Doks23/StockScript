import { format } from "date-fns";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: Date | string) {
  return format(new Date(value), "dd MMM yyyy, hh:mm a");
}

export function formatDateValue(value: Date | string) {
  return format(new Date(value), "dd MMM yyyy");
}
