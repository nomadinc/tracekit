export type EverflowClickDeduplicationResult<T> = {
  clicks: T[];
  normalizedRowCount: number;
  deduplicatedRowCount: number;
  duplicateObservationsRemoved: number;
};

export function deduplicateEverflowClicks<T extends { transactionId: string }>(
  input: {
    organizationId: string;
    connectionId: string;
    providerAccountId: string;
    clicks: T[];
  },
): EverflowClickDeduplicationResult<T> {
  const byDurableIdentity = new Map<string, T>();
  for (const click of input.clicks) {
    const durableIdentity = JSON.stringify([
      input.organizationId,
      input.connectionId,
      input.providerAccountId,
      click.transactionId,
    ]);
    // Match sequential upsert semantics: the latest normalized provider
    // observation supplies mutable fields for this invocation.
    byDurableIdentity.set(durableIdentity, click);
  }
  const clicks = Array.from(byDurableIdentity.values());
  return {
    clicks,
    normalizedRowCount: input.clicks.length,
    deduplicatedRowCount: clicks.length,
    duplicateObservationsRemoved: input.clicks.length - clicks.length,
  };
}
