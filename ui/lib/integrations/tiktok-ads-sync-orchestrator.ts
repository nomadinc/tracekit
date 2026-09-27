export type TikTokSyncAccount = {
  id: string;
  connectionId: string;
  externalId: string;
  eligibleForSpendSync: boolean;
  selectedForSync: boolean;
  status: string;
};

export type TikTokSyncWindow = { since: string; until: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function date(value: string) {
  if (!DATE.test(value)) throw new Error("Invalid TikTok Ads sync date.");
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid TikTok Ads sync date.");
  }
  return parsed;
}

function ymd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const parsed = date(value);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return ymd(parsed);
}

function windows(since: string, until: string, maxDays: number) {
  const out: TikTokSyncWindow[] = [];
  let current = since;
  while (current <= until) {
    const candidate = addDays(current, maxDays - 1);
    const end = candidate < until ? candidate : until;
    out.push({ since: current, until: end });
    current = addDays(end, 1);
  }
  return out;
}

/**
 * Deterministic TikTok planning only. This module performs no provider calls and
 * activates no schedules. TikTok reporting is restatable, so callers may supply
 * overlapDays to deliberately re-read recent account-local report dates.
 */
export function planTikTokAdsSync(input: {
  accounts: TikTokSyncAccount[];
  since: string;
  until: string;
  maxWindowDays?: number;
  overlapDays?: number;
}) {
  date(input.since);
  date(input.until);
  if (input.since > input.until) throw new Error("TikTok Ads sync date range is invalid.");

  const maxWindowDays = input.maxWindowDays ?? 31;
  if (!Number.isInteger(maxWindowDays) || maxWindowDays < 1) {
    throw new Error("Invalid TikTok Ads sync window.");
  }

  const overlapDays = input.overlapDays ?? 0;
  if (!Number.isInteger(overlapDays) || overlapDays < 0) {
    throw new Error("Invalid TikTok Ads overlap.");
  }

  const effectiveSince = addDays(input.since, -overlapDays);
  const eligible = input.accounts.filter(
    (account) =>
      account.selectedForSync &&
      account.eligibleForSpendSync &&
      (account.status === "active" || account.status === "degraded"),
  );

  if (!eligible.length) throw new Error("No selected spend-eligible TikTok Ads accounts.");

  return {
    effectiveSince,
    until: input.until,
    targets: eligible.map((account) => ({
      connectionId: account.connectionId,
      providerAccountId: account.id,
      advertiserId: account.externalId,
      windows: windows(effectiveSince, input.until, maxWindowDays),
    })),
  };
}
