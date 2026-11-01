export function qualifyProfitCurrency(
  rows: Array<{ currency?: string | null }>
) {
  const currencies = Array.from(
    new Set(
      rows.map((row) =>
        String(row.currency ?? "").trim().toUpperCase()
      )
    )
  );

  const valid = currencies.length <= 1 &&
    !currencies.includes("");

  return {
    valid,
    currency: valid && currencies.length === 1
      ? currencies[0]
      : null,
    currencies: currencies.filter(Boolean).sort(),
    data_available: rows.length > 0,
  };
}
