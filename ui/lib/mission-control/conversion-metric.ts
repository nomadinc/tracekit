export async function readConversionMetric(readCount: () => Promise<number>) {
  try {
    const value = await readCount();
    return { value, state: "partial" as const, detail: "Canonical conversion rows without a financial ledger subtype; provider-specific qualification remains visible elsewhere." };
  } catch {
    return { value: null, state: "unavailable" as const, detail: "Conversion evidence could not be read. Try again later." };
  }
}
