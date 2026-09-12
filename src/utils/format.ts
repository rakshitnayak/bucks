import type { PaymentMode } from "../api";

export const paymentModes: Array<[PaymentMode, string]> = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["debit_card", "Debit card"],
  ["credit_card", "Credit card"],
  ["bank_transfer", "Bank transfer"],
  ["cheque", "Cheque"],
  ["other", "Other"],
];

export const paymentModeLabel = (value: PaymentMode) =>
  paymentModes.find(([key]) => key === value)?.[1] ?? value;

export const money = (minor: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);

export const shortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "No entries yet";

export const localDateTime = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

export const dateRange = (period: string) => {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now.getFullYear(), now.getMonth(), 1);

  if (period === "last") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setTime(
      new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime(),
    );
  }

  if (period === "quarter") {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }

  if (period === "year") {
    start = new Date(now.getFullYear(), 0, 1);
  }

  return {
    from: start.toLocaleDateString("en-CA"),
    to: end.toLocaleDateString("en-CA"),
  };
};
