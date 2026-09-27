import { persistTikTokAdDailyRows } from "../lib/integrations/tiktok-ads-reporting-persistence";

type Row = Record<string, any>;
const tables = new Map<string, Row[]>([
  ["marketing_campaigns", []], ["marketing_ad_groups", []], ["marketing_ads", []],
  ["marketing_evidence_records", []], ["marketing_performance_daily", []], ["marketing_costs", []],
]);
let seq = 0;
const body = (init?: RequestInit) => init?.body ? JSON.parse(String(init.body)) : null;
function table(path: string) { return path.split("?")[0]; }
function params(path: string) { return new URLSearchParams(path.includes("?") ? path.split("?")[1] : ""); }
function match(row: Row, key: string, value: string) { return String(row[key]) === decodeURIComponent(value.replace(/^eq\./, "")); }

async function transport(path: string, init: RequestInit = {}): Promise<Row[]> {
  const name = table(path), rows = tables.get(name);
  if (!rows) throw new Error("Unexpected table " + name);
  const method = init.method || "GET";
  if (method === "POST") {
    const value = { id: `${name}-${++seq}`, ...body(init) };
    if (name === "marketing_evidence_records") {
      const duplicate = rows.find(r => r.connection_id === value.connection_id && r.provider_account_id === value.provider_account_id && r.source_object_type === value.source_object_type && r.source_object_id === value.source_object_id && r.payload_hash === value.payload_hash);
      if (duplicate) return [];
    }
    rows.push(value); return [value];
  }
  const query = params(path);
  let found = rows.filter(row => {
    for (const [key, value] of query.entries()) {
      if (key === "limit" || key === "on_conflict") continue;
      if (!match(row, key, value)) return false;
    }
    return true;
  });
  if (method === "PATCH") {
    const patch = body(init);
    found.forEach(row => Object.assign(row, patch));
    return found;
  }
  return found;
}

const base = {
  organizationId: "org", connectionId: "conn", providerAccountId: "account", syncRunId: "run-1",
  apiVersion: "v1.3", advertiserId: "700000000000000001", currency: "USD", timezoneName: "America/Los_Angeles",
  transport, observedAt: "2026-09-26T12:00:00.000Z",
};
const firstRaw = { dimensions: { stat_time_day: "2026-09-25", campaign_id: "11", adgroup_id: "22", ad_id: "33" }, metrics: { spend: "10.50", impressions: "100", clicks: "5" } };
const first = await persistTikTokAdDailyRows({ ...base, rawRows: [firstRaw] });
if (first.created !== 1 || first.evidenceCreated !== 1 || first.costsCreated !== 1) throw new Error("Initial TikTok persistence failed.");

const unchanged = await persistTikTokAdDailyRows({ ...base, syncRunId: "run-2", observedAt: "2026-09-26T13:00:00.000Z", rawRows: [firstRaw] });
if (unchanged.unchanged !== 1 || unchanged.evidenceCreated !== 0 || unchanged.costsCreated !== 0) throw new Error("TikTok idempotency failed.");

const restatedRaw = { ...firstRaw, metrics: { spend: "12.75", impressions: "120", clicks: "6" } };
const restated = await persistTikTokAdDailyRows({ ...base, syncRunId: "run-3", observedAt: "2026-09-27T12:00:00.000Z", rawRows: [restatedRaw] });
if (restated.updated !== 1 || restated.evidenceCreated !== 1 || restated.costsUpdated !== 1) throw new Error("TikTok restatement persistence failed.");

const evidence = tables.get("marketing_evidence_records")!;
const facts = tables.get("marketing_performance_daily")!;
const costs = tables.get("marketing_costs")!;
if (evidence.length !== 2) throw new Error("TikTok restatement must preserve both source observations.");
if (facts.length !== 1 || String(facts[0].spend) !== "12.75") throw new Error("TikTok canonical fact must converge to latest observation.");
if (costs.length !== 1 || String(costs[0].amount) !== "12.75") throw new Error("TikTok spend projection must converge without duplication.");

console.log("tiktok-ads-reporting-persistence tests passed");
