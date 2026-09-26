import assert from "node:assert/strict";
import test from "node:test";
import {
  persistGoogleAdDailyRows,
  type GoogleReportingTransport,
} from "../lib/integrations/google-ads-reporting-persistence";

function memoryTransport() {
  const db: Record<string, any[]> = {
    marketing_campaigns: [], marketing_ad_groups: [], marketing_ads: [],
    marketing_performance_daily: [], marketing_evidence_records: [], marketing_costs: [],
  };
  let seq = 0;
  const transport: GoogleReportingTransport = async (path, init = {}) => {
    const method = init.method || "GET";
    const table = path.split("?")[0];
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (method === "POST") {
      if (path.includes("on_conflict=") && table === "marketing_evidence_records") {
        const prior = db[table].find(r => r.payload_hash === body.payload_hash && r.source_object_id === body.source_object_id && r.provider_account_id === body.provider_account_id);
        if (prior) return [];
      }
      const row = { id: `${table}-${++seq}`, ...body }; db[table].push(row); return [row];
    }
    const filters = Object.fromEntries(Array.from(path.matchAll(/(?:\?|&)([a-z_]+)=eq\.([^&]+)/g)).map(m => [m[1], decodeURIComponent(m[2])]));
    const found = (db[table] || []).filter(row => Object.entries(filters).every(([k,v]) => String(row[k]) === v));
    if (method === "PATCH") { Object.assign(found[0], body); return found.slice(0,1); }
    return found;
  };
  return { transport, db };
}

const baseRow:any = {
  customer: { id: "1234567890", currencyCode: "USD", timeZone: "UTC" },
  campaign: { id: "10", name: "Campaign", status: "ENABLED" },
  adGroup: { id: "20", name: "Group", status: "ENABLED" },
  adGroupAd: { status: "ENABLED", ad: { id: "30", name: "Ad" } },
  segments: { date: "2026-09-03" },
  metrics: { impressions: "100", clicks: "5", costMicros: "1234567" },
};

test("first Google daily observation creates hierarchy, immutable evidence, fact, and cost", async () => {
  const m = memoryTransport();
  const result = await persistGoogleAdDailyRows({
    organizationId:"org", connectionId:"conn", providerAccountId:"pa", syncRunId:"run1",
    apiVersion:"v25", rawRows:[baseRow], transport:m.transport, observedAt:"2026-09-26T20:00:00Z",
  });
  assert.deepEqual(result, { seen:1, created:1, updated:0, unchanged:0, evidenceCreated:1, costsCreated:1, costsUpdated:0 });
  assert.equal(m.db.marketing_campaigns.length,1);
  assert.equal(m.db.marketing_ad_groups.length,1);
  assert.equal(m.db.marketing_ads.length,1);
  assert.equal(m.db.marketing_performance_daily[0].spend,"1.234567");
  assert.equal(m.db.marketing_performance_daily[0].metadata.google.costMicros,"1234567");
  assert.equal(m.db.marketing_costs[0].amount,"1.234567");
});

test("Google restatement updates current fact/cost but preserves both source observations", async () => {
  const m = memoryTransport();
  const common = { organizationId:"org", connectionId:"conn", providerAccountId:"pa", apiVersion:"v25", transport:m.transport };
  await persistGoogleAdDailyRows({ ...common, syncRunId:"run1", rawRows:[baseRow], observedAt:"2026-09-26T20:00:00Z" });
  const revised = structuredClone(baseRow);
  revised.metrics.costMicros = "2234567";
  revised.metrics.clicks = "6";
  const result = await persistGoogleAdDailyRows({ ...common, syncRunId:"run2", rawRows:[revised], observedAt:"2026-09-27T20:00:00Z" });
  assert.equal(result.updated,1);
  assert.equal(result.evidenceCreated,1);
  assert.equal(result.costsUpdated,1);
  assert.equal(m.db.marketing_performance_daily.length,1);
  assert.equal(m.db.marketing_performance_daily[0].spend,"2.234567");
  assert.equal(m.db.marketing_costs.length,1);
  assert.equal(m.db.marketing_costs[0].amount,"2.234567");
  assert.equal(m.db.marketing_evidence_records.length,2);
  assert.notEqual(m.db.marketing_evidence_records[0].payload_hash,m.db.marketing_evidence_records[1].payload_hash);
});

test("identical overlapping observation is idempotent but advances last observation", async () => {
  const m = memoryTransport();
  const common = { organizationId:"org", connectionId:"conn", providerAccountId:"pa", apiVersion:"v25", transport:m.transport };
  await persistGoogleAdDailyRows({ ...common, syncRunId:"run1", rawRows:[baseRow], observedAt:"2026-09-26T20:00:00Z" });
  const result = await persistGoogleAdDailyRows({ ...common, syncRunId:"run2", rawRows:[baseRow], observedAt:"2026-09-27T20:00:00Z" });
  assert.equal(result.unchanged,1);
  assert.equal(result.evidenceCreated,0);
  assert.equal(m.db.marketing_evidence_records.length,1);
  assert.equal(m.db.marketing_performance_daily[0].last_observed_at,"2026-09-27T20:00:00Z");
});
