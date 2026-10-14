export function formatDisputeAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
  currencySource: string | null | undefined
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";

  const code = typeof currency === "string"
    ? currency.trim().toUpperCase()
    : "";

  const approvedSources = new Set([
    "provider_payload.currency",
    "provider_payload.fee_currency",
    "workbook.Currency",
    "workbook.Fee Currency",
  ]);

  if (!currencySource || !approvedSources.has(currencySource) || !/^[A-Z]{3}$/.test(code)) {
    return `${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} (currency unknown)`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} (currency unknown)`;
  }
}
