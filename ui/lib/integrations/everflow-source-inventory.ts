import "server-only";
import { createHash } from "node:crypto";
import { listEverflowConversionsPage, validateEverflowConversionRange, type EverflowConversionPage } from "./everflow-conversions";

export class EverflowInventoryError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Provider reads only. No persistence, leases, checkpoints or cursor changes. */
export async function captureEverflowSourceInventory(input: {
  apiKey: string; networkId: string; from: string; to: string;
  timezoneId: number; currencyId: string;
  fetchPage?: typeof listEverflowConversionsPage;
  now?: () => number;
}) {
  const range = validateEverflowConversionRange(input.from, input.to);
  if(input.timezoneId !== 80 || input.currencyId !== "USD") throw new EverflowInventoryError("everflow_inventory_reporting_scope_unverified");
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const localTime=(value:string)=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;};
  const now = input.now || Date.now;
  const startedAt = now();
  const read = input.fetchPage || listEverflowConversionsPage;
  const rows: Array<[string, string, string]> = [];
  const identities = new Set<string>();
  const classifications: Record<string, number> = {};
  const advertisers: Record<string, number> = {};
  const pageSize = 1000;
  let declaredTotal: number | null = null;
  let pages = 0;
  for (let page = 1; page <= 25; page++) {
    if (now() - startedAt > 240_000) throw new EverflowInventoryError("everflow_inventory_runtime_limit");
    const result: EverflowConversionPage = await read({
      apiKey: input.apiKey, from: input.from, to: input.to,
      timezoneId: input.timezoneId, currencyId: input.currencyId,
      page, pageSize, timeoutMs: 10_000,
    });
    if (result.page !== page || result.pageSize !== pageSize ||
        !Number.isSafeInteger(result.totalCount) || result.totalCount < 0 || result.totalCount > 25_000)
      throw new EverflowInventoryError("everflow_inventory_paging_invalid");
    if (declaredTotal !== null && declaredTotal !== result.totalCount)
      throw new EverflowInventoryError("everflow_inventory_population_changed");
    declaredTotal = result.totalCount;
    if (result.conversions.length > pageSize) throw new EverflowInventoryError("everflow_inventory_page_overflow");
    for (const row of result.conversions) {
      if (row.networkId !== input.networkId || row.currency !== input.currencyId)
        throw new EverflowInventoryError("everflow_inventory_source_scope_unverified");
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(row.sourceIdentity) || row.conversionId !== row.sourceIdentity ||
          !/^[a-f0-9]{64}$/.test(row.payloadHash) || !/^[a-f0-9]{64}$/.test(row.rawPayloadHash))
        throw new EverflowInventoryError("everflow_inventory_identity_invalid");
      const time=localTime(row.conversionAt);
      if(time < range.from || time > range.to) throw new EverflowInventoryError("everflow_inventory_date_scope_unverified");
      if (identities.has(row.sourceIdentity)) throw new EverflowInventoryError("everflow_inventory_duplicate_identity");
      identities.add(row.sourceIdentity);
      rows.push([row.sourceIdentity, row.payloadHash, row.rawPayloadHash]);
      const category = `${row.isEvent ? "event" : "conversion"}:${row.status || "unknown"}`;
      classifications[category] = (classifications[category] || 0) + 1;
      advertisers[row.advertiserId || "unknown"] = (advertisers[row.advertiserId || "unknown"] || 0) + 1;
    }
    pages++;
    if (rows.length > declaredTotal) throw new EverflowInventoryError("everflow_inventory_count_overflow");
    if (rows.length === declaredTotal) break;
    if (result.conversions.length < pageSize)
      throw new EverflowInventoryError("everflow_inventory_truncated");
  }
  if (rows.length !== declaredTotal) throw new EverflowInventoryError("everflow_inventory_incomplete");
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return {
    schemaVersion: 1, readOnly: true,
    startedAt: new Date(startedAt).toISOString(), completedAt: new Date(now()).toISOString(),
    query: { networkId: input.networkId, from: input.from, to: input.to, timezoneId: input.timezoneId,
      currencyId: input.currencyId, showConversions: true, showEvents: true, filters: [], searchTerms: [] },
    sourceTotal: declaredTotal, uniqueIdentities: rows.length, pages, pageSize, classifications, advertisers,
    identitySetSha256: hash(rows.map(row => row[0])),
    normalizedVersionSetSha256: hash(rows.map(row => row.slice(0, 2))),
    rawVersionSetSha256: hash(rows.map(row => [row[0], row[2]])),
    stability: "single_bounded_read_requires_independent_repeat",
    columns: ["conversion_id", "normalized_payload_sha256", "raw_payload_sha256"], rows,
  };
}
