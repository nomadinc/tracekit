export type GoogleAccessibleCustomerFixture = {
  customerId: string;
};

export type GoogleCustomerClientFixture = {
  loginCustomerId: string;
  customerId: string;
  parentCustomerId: string | null;
  level: number;
  manager: boolean;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
};

export type GoogleDiscoveredAccount = {
  customerId: string;
  parentCustomerId: string | null;
  accountType: "manager" | "advertiser";
  hierarchyDepth: number;
  isManager: boolean;
  eligibleForSpendSync: boolean;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  loginCustomerIds: string[];
};

export function normalizeGoogleCustomerId(value: string) {
  const normalized = String(value || "").trim().replace(/-/g, "");
  if (!/^\d{10}$/.test(normalized)) throw new Error("Invalid Google Ads customer ID.");
  return normalized;
}

export function buildGoogleAccountDiscovery(
  accessible: GoogleAccessibleCustomerFixture[],
  observations: GoogleCustomerClientFixture[],
) {
  const rootIds = Array.from(new Set(accessible.map((row) => normalizeGoogleCustomerId(row.customerId))));
  const byCustomer = new Map<string, GoogleDiscoveredAccount>();

  for (const observation of observations) {
    const customerId = normalizeGoogleCustomerId(observation.customerId);
    const loginCustomerId = normalizeGoogleCustomerId(observation.loginCustomerId);
    const parentCustomerId = observation.parentCustomerId
      ? normalizeGoogleCustomerId(observation.parentCustomerId)
      : null;
    if (!Number.isSafeInteger(observation.level) || observation.level < 0) {
      throw new Error("Invalid Google Ads hierarchy level.");
    }

    const existing = byCustomer.get(customerId);
    const loginCustomerIds = Array.from(new Set([...(existing?.loginCustomerIds || []), loginCustomerId])).sort();
    const candidate: GoogleDiscoveredAccount = {
      customerId,
      parentCustomerId: existing?.parentCustomerId ?? parentCustomerId,
      accountType: observation.manager ? "manager" : "advertiser",
      hierarchyDepth: existing ? Math.min(existing.hierarchyDepth, observation.level) : observation.level,
      isManager: observation.manager,
      eligibleForSpendSync: !observation.manager,
      descriptiveName: existing?.descriptiveName || observation.descriptiveName,
      currencyCode: existing?.currencyCode || observation.currencyCode,
      timeZone: existing?.timeZone || observation.timeZone,
      loginCustomerIds,
    };

    if (existing && existing.parentCustomerId && parentCustomerId && existing.parentCustomerId !== parentCustomerId) {
      // Google access is a DAG. Keep one canonical parent for the account row while
      // retaining every authorization path in loginCustomerIds/source evidence.
      candidate.parentCustomerId = existing.parentCustomerId;
    }
    byCustomer.set(customerId, candidate);
  }

  for (const rootId of rootIds) {
    if (!byCustomer.has(rootId)) {
      byCustomer.set(rootId, {
        customerId: rootId,
        parentCustomerId: null,
        accountType: "manager",
        hierarchyDepth: 0,
        isManager: true,
        eligibleForSpendSync: false,
        descriptiveName: null,
        currencyCode: null,
        timeZone: null,
        loginCustomerIds: [rootId],
      });
    }
  }

  const accounts = Array.from(byCustomer.values()).sort(
    (a, b) => a.hierarchyDepth - b.hierarchyDepth || a.customerId.localeCompare(b.customerId),
  );
  const roots = rootIds.map((customerId) => ({
    customerId,
    loginCustomerId: customerId,
  }));

  return { roots, accounts };
}
