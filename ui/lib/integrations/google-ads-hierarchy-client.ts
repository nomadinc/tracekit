import {
  buildGoogleAccountDiscovery,
  normalizeGoogleCustomerId,
  type GoogleCustomerClientFixture,
} from "./google-ads-account-discovery";

export type GoogleHierarchyRow = {
  customerId: string;
  parentCustomerId: string | null;
  level: number;
  manager: boolean;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
};

export type GoogleHierarchyFetcher = (input: {
  targetCustomerId: string;
  loginCustomerId: string;
}) => Promise<GoogleHierarchyRow[]>;

export async function discoverGoogleCustomerHierarchy(input: {
  accessibleCustomerIds: string[];
  fetchHierarchy: GoogleHierarchyFetcher;
  maxQueries?: number;
  maxAccounts?: number;
}) {
  const roots = Array.from(new Set(input.accessibleCustomerIds.map(normalizeGoogleCustomerId)));
  const maxQueries = input.maxQueries ?? 500;
  const maxAccounts = input.maxAccounts ?? 10_000;
  if (!roots.length) return buildGoogleAccountDiscovery([], []);

  const observations: GoogleCustomerClientFixture[] = [];
  const observedCustomers = new Set<string>();
  let queryCount = 0;

  for (const loginCustomerId of roots) {
    const queue: Array<{ targetCustomerId: string; absoluteDepth: number }> = [
      { targetCustomerId: loginCustomerId, absoluteDepth: 0 },
    ];
    const queriedForRoot = new Set<string>();

    while (queue.length) {
      const next = queue.shift()!;
      if (queriedForRoot.has(next.targetCustomerId)) continue;
      if (queryCount >= maxQueries) throw new Error("Google Ads discovery bound exceeded.");
      queriedForRoot.add(next.targetCustomerId);
      queryCount += 1;

      const rows = await input.fetchHierarchy({
        targetCustomerId: next.targetCustomerId,
        loginCustomerId,
      });

      const enqueued = new Set<string>();
      for (const row of rows) {
        const customerId = normalizeGoogleCustomerId(row.customerId);
        const parentCustomerId = row.parentCustomerId ? normalizeGoogleCustomerId(row.parentCustomerId) : null;
        if (!Number.isSafeInteger(row.level) || row.level < 0) throw new Error("Invalid Google Ads hierarchy level.");
        const absoluteDepth = next.absoluteDepth + row.level;
        observations.push({
          loginCustomerId,
          customerId,
          parentCustomerId,
          level: absoluteDepth,
          manager: row.manager,
          descriptiveName: row.descriptiveName,
          currencyCode: row.currencyCode,
          timeZone: row.timeZone,
        });
        observedCustomers.add(customerId);
        if (observedCustomers.size > maxAccounts) throw new Error("Google Ads discovery bound exceeded.");

        if (
          row.manager &&
          customerId !== next.targetCustomerId &&
          !queriedForRoot.has(customerId) &&
          !enqueued.has(customerId)
        ) {
          queue.push({ targetCustomerId: customerId, absoluteDepth });
          enqueued.add(customerId);
        }
      }
    }
  }

  return buildGoogleAccountDiscovery(
    roots.map((customerId) => ({ customerId })),
    observations,
  );
}
