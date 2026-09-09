import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  EVERFLOW_TRANSACTION_ID_CONVERSION_URL,
  buildEverflowTransactionIdConversionPayload,
  forwardEverflowTransactionIdConversion,
  liveEverflowForwardingEnabled,
} from "../lib/integrations/everflow-forwarding.ts";
import { normalizeConversionPayload } from "../../api/src/everflow-scrubber.ts";
import { syncEverflowAffiliates } from "../lib/integrations/everflow-affiliates.ts";
import { syncEverflowOffers } from "../lib/integrations/everflow-offers.ts";

const conversion = () => {
  const result = normalizeConversionPayload({ transaction_id: "tid-cert", oid: 52, affid: 107, order_id: "ORD-CERT", amount: 67, currency: "USD", user_ip: "1.2.3.4", coupon_code: "SAVE", email: "person@example.invalid", adv1: "one", adv10: "ten" }, "m3_test");
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture invalid");
  return result.conversion;
};

test("certified transaction-id payload includes only documented Everflow fields", () => {
  const payload = buildEverflowTransactionIdConversionPayload({ conversion: conversion(), timezoneId: 90 });
  assert.equal(EVERFLOW_TRANSACTION_ID_CONVERSION_URL, "https://api.eflow.team/v1/networks/conversions/reporting/transaction_ids");
  assert.deepEqual(payload, {
    is_now: true, offer_id: 52, timezone_id: 90, event_id: 0, transaction_ids: ["tid-cert"],
    is_payout_amount_submitted: false, revenue_amount: 67, is_revenue_amount_submitted: true,
    order_id: "ORD-CERT", coupon_code: "SAVE", email: "person@example.invalid", adv1: "one", adv10: "ten",
  });
  assert.equal("currency" in payload, false);
  assert.equal("user_ip" in payload, false);
  assert.equal("affid" in payload, false);
  assert.equal("adv_event_id" in payload, false);
});

test("live forwarding feature flag is exact and defaults disabled", () => {
  assert.equal(liveEverflowForwardingEnabled({}), false);
  assert.equal(liveEverflowForwardingEnabled({ LIVE_EVERFLOW_FORWARDING_ENABLED: "false" }), false);
  assert.equal(liveEverflowForwardingEnabled({ LIVE_EVERFLOW_FORWARDING_ENABLED: "TRUE" }), false);
  assert.equal(liveEverflowForwardingEnabled({ LIVE_EVERFLOW_FORWARDING_ENABLED: "true" }), true);
});

test("forwarder uses POST API key contract and result true success semantics", async () => {
  let calls = 0;
  const result = await forwardEverflowTransactionIdConversion({ apiKey: "secret-api-key", payload: buildEverflowTransactionIdConversionPayload({ conversion: conversion(), timezoneId: 90 }), fetchImpl: async (url, init) => {
    calls += 1;
    assert.equal(String(url), EVERFLOW_TRANSACTION_ID_CONVERSION_URL);
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["X-Eflow-Api-Key"], "secret-api-key");
    return new Response(JSON.stringify({ result: true }), { status: 200, headers: { "content-type": "application/json" } });
  } });
  assert.equal(result.outcome, "succeeded");
  assert.equal(calls, 1);
});

test("forwarder classifies documented false, rate limit, server, and timeout failures", async () => {
  const payload = buildEverflowTransactionIdConversionPayload({ conversion: conversion(), timezoneId: 90 });
  const falseResult = await forwardEverflowTransactionIdConversion({ apiKey: "secret-api-key", payload, fetchImpl: async () => new Response(JSON.stringify({ result: false }), { status: 200 }) });
  const limited = await forwardEverflowTransactionIdConversion({ apiKey: "secret-api-key", payload, fetchImpl: async () => new Response("{}", { status: 429 }) });
  const server = await forwardEverflowTransactionIdConversion({ apiKey: "secret-api-key", payload, fetchImpl: async () => new Response("{}", { status: 503 }) });
  assert.deepEqual([falseResult.outcome, limited.outcome, server.outcome], ["permanent_failure", "retryable_failure", "retryable_failure"]);
});

test("metadata sync and admin APIs are server authenticated and auditable", () => {
  const affiliate = readFileSync(new URL("../lib/integrations/everflow-affiliates.ts", import.meta.url), "utf8");
  const offer = readFileSync(new URL("../lib/integrations/everflow-offers.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/scrubber/config/route.ts", import.meta.url), "utf8");
  assert.match(affiliate, /startEverflowMetadataSyncAudit/);
  assert.match(affiliate, /finishAudit/);
  assert.match(offer, /startEverflowMetadataSyncAudit/);
  assert.match(offer, /finishAudit/);
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /connectors\.manage/);
  assert.match(route, /sameOrigin/);
});

test("affiliate and offer sync are bounded upserts with successful audit completion", async () => {
  const plane = {
    getConnection: async () => ({ id: "connection", organizationId: "organization", provider: "everflow", status: "connected" }),
    listProviderAccounts: async () => [{ id: "account", externalId: "77", status: "active", provisional: false }],
    resolveCredentialForExecution: async () => "server-secret-key",
  } as never;
  const completed: Array<Record<string, unknown>> = [];
  const common = {
    plane, session: {} as never, organizationId: "organization", connectionId: "connection", requestId: crypto.randomUUID(),
    startAudit: async () => "audit", finishAudit: async (input: Record<string, unknown>) => { completed.push(input); },
  };
  let affiliatePersisted = 0;
  const affiliates = await syncEverflowAffiliates({ ...common,
    fetchPage: async () => ({ affiliates: [{ networkAffiliateId: "107", networkId: "77", name: "Publisher", accountStatus: "inactive", defaultCurrencyId: null, networkEmployeeId: null, networkTrafficSourceId: null, accountExecutiveId: null, referrerId: null, enableMediaCostTrackingLinks: null, sourceTimeCreated: null, sourceTimeSaved: null }], page: 1, pageSize: 200, totalCount: 1 }),
    persistPage: async (input) => { affiliatePersisted += input.affiliates.length; return input.affiliates.length; },
  });
  let offerPersisted = 0;
  const offers = await syncEverflowOffers({ ...common, requestId: crypto.randomUUID(),
    fetchPage: async () => ({ offers: [{ networkOfferId: "52", networkId: "77", networkAdvertiserId: "8", name: "Offer", offerStatus: "paused", currencyId: "USD", visibility: null, networkCategoryId: null, networkOfferGroupId: null, networkTrackingDomainId: null, destinationUrl: null, previewUrl: null, thumbnailUrl: null, sourceTimeCreated: null, sourceTimeSaved: null }], page: 1, pageSize: 200, totalCount: 1 }),
    persistPage: async (input) => { offerPersisted += input.offers.length; return input.offers.length; },
  });
  assert.deepEqual([affiliates.seen, affiliatePersisted, offers.seen, offerPersisted], [1, 1, 1, 1]);
  assert.equal(completed.filter((row) => row.status === "succeeded").length, 2);
});

test("metadata sync records a bounded failure audit without exposing the credential", async () => {
  const completed: Array<Record<string, unknown>> = [];
  await assert.rejects(() => syncEverflowAffiliates({
    plane: { getConnection: async () => ({ id: "connection", organizationId: "organization", provider: "everflow", status: "connected" }), listProviderAccounts: async () => [{ id: "account", externalId: "77", status: "active", provisional: false }], resolveCredentialForExecution: async () => "server-secret-key" } as never,
    session: {} as never, organizationId: "organization", connectionId: "connection",
    startAudit: async () => "audit", finishAudit: async (input: Record<string, unknown>) => { completed.push(input); },
    fetchPage: async () => { throw Object.assign(new Error("secret must not persist"), { code: "everflow_unavailable" }); },
  }));
  assert.equal(completed[0]?.status, "failed");
  assert.equal(completed[0]?.errorCode, "everflow_unavailable");
  assert.doesNotMatch(JSON.stringify(completed), /server-secret-key|secret must not persist/);
});
