import assert from "node:assert/strict";
import test from "node:test";
import { selectCustomerJourney } from "../lib/customers/ws026-journey-choice";
import { collectCoreTimelinePages } from "../lib/customers/ws026-core-timeline-pages";
import { resolveOrderJourney } from "../lib/orders/ws026-journey-selection";
import { assessOrderFinancialEvidence, type OrderFinancialEvidence } from "../lib/orders/ws026-financial-evidence";

const journey = (id: string, status: "ready" | "unresolved" | "stale" = "ready") =>
  ({ id, status, eventCount: 2, nextCursor: null, explanation: "fixture" });

test("one ready journey auto-selects; multiple, missing, stale and duplicates fail closed", () => {
  assert.equal(selectCustomerJourney([journey("a")], null).selectedId, "a");
  assert.equal(selectCustomerJourney([journey("a"), journey("b")], null).selectedId, null);
  assert.equal(selectCustomerJourney([journey("a"), journey("b")], "b").selectedId, "b");
  assert.equal(selectCustomerJourney([journey("a")], "foreign").selectedId, null);
  assert.equal(selectCustomerJourney([journey("a", "stale")], "a").selectedId, null);
  assert.equal(selectCustomerJourney([journey("a", "unresolved")], null).selectedId, null);
  assert.equal(selectCustomerJourney([journey("a"), journey("a")], "a").selectedId, null);
});

test("keyset timeline deduplicates identical events without claiming snapshot stability", async () => {
  const calls: Array<string | null> = [];
  const result = await collectCoreTimelinePages(async cursor => {
    calls.push(cursor);
    return cursor === null
      ? {events: [{id:"purchase",type:"purchase"}, {id:"upsell",type:"upsell"}],next_cursor:"c1"}
      : {events: [{id:"upsell",type:"upsell"}, {id:"refund",type:"refund"}, {id:"rebill",type:"rebill"}],next_cursor:null};
  });
  assert.equal(result.status, "complete");
  if (result.status === "complete") {
    assert.deepEqual(result.events.map(e => (e as {id:string}).id), ["purchase","upsell","refund","rebill"]);
    assert.match(result.limitation ?? "", /No snapshot watermark/);
  }
  assert.deepEqual(calls, [null, "c1"]);
});

test("timeline rejects conflicting duplicates, cursor cycles and malformed pages", async () => {
  const conflict = await collectCoreTimelinePages(async cursor => cursor === null
    ? {events:[{id:"x",type:"purchase"}],next_cursor:"next"}
    : {events:[{id:"x",type:"refund"}],next_cursor:null});
  assert.deepEqual(conflict, {status:"unavailable",reason:"duplicate_conflict",events:[]});
  const cycle = await collectCoreTimelinePages(async cursor => ({
    events:[{id:cursor ?? "start"}],next_cursor:cursor ?? "c1"
  }));
  assert.deepEqual(cycle, {status:"unavailable",reason:"cursor_cycle",events:[]});
  const invalid = await collectCoreTimelinePages(async () => ({events:[{type:"no-id"}],next_cursor:null}));
  assert.deepEqual(invalid, {status:"unavailable",reason:"invalid_page",events:[]});
});

const orderInput = () => ({
  canonicalOrderId: "order-a", organizationId:"org-a", workspaceId:"workspace-a",
  journeys:[{id:"journey-a",organization_id:"org-a",workspace_id:"workspace-a"}],
  references:[{canonical_order_id:"order-a",journey_id:"journey-a",organization_id:"org-a",workspace_id:"workspace-a",status:"verified"}]
});

test("only a verified same-scope canonical order link produces a journey", () => {
  const input = orderInput();
  assert.deepEqual(resolveOrderJourney(input), {status:"linked",journeyId:"journey-a"});
  assert.deepEqual(resolveOrderJourney({...input,references:[]}), {status:"unresolved",reason:"missing_link"});
  assert.deepEqual(resolveOrderJourney({...input,canonicalOrderId:null}), {status:"unresolved",reason:"missing_order_id"});
  assert.deepEqual(resolveOrderJourney({...input,references:[{...input.references[0],status:"observed"}]}), {status:"unresolved",reason:"missing_link"});
  assert.deepEqual(resolveOrderJourney({...input,references:[...input.references,{...input.references[0],journey_id:"journey-b",status:"verified"}]}), {status:"unresolved",reason:"ambiguous_link"});
  assert.deepEqual(resolveOrderJourney({...input,references:[{...input.references[0],organization_id:"org-b"}]}), {status:"unresolved",reason:"foreign_scope"});
  assert.deepEqual(resolveOrderJourney({...input,journeys:[{id:"journey-a",organization_id:"org-b"}]}), {status:"unresolved",reason:"missing_journey"});
});

const financial = (): OrderFinancialEvidence => ({
  currency:"USD", grossRevenue:{amount:"100.00",evidenceId:"gross"},
  refunds:[],affiliateCommission:{amount:"10.00",evidenceId:"commission"},
  landedCogs:{amount:"30.00",evidenceId:"cogs",appliedVersionId:"cost-v1",includesShipping:true},
  processingFees:{amount:"3.00",evidenceId:"fee",actual:true},
  reconciliation:{statementEvidenceId:"statement",status:"closed",accepted:true},
  sourceCurrent:true,
});

test("financial completeness never invents operational or reconciled profit", () => {
  const ready = assessOrderFinancialEvidence(financial());
  assert.equal(ready.status,"reconciliation_pending");
  assert.equal(ready.operationalProfitDisplay,null);
  assert.equal(ready.reconciledProfitDisplay,null);
  for (const [name, change] of [
    ["source_currency", {currency:null}],
    ["historical_landed_cogs", {landedCogs:null}],
    ["actual_processing_fees", {processingFees:{amount:"3.00",evidenceId:"estimated",actual:false}}],
    ["affiliate_commission_evidence", {affiliateCommission:null}],
    ["refund_completeness", {refunds:null}],
    ["stale_financial_source", {sourceCurrent:false}],
  ] as const) {
    const result = assessOrderFinancialEvidence({...financial(),...change} as OrderFinancialEvidence);
    assert.ok(result.missing.includes(name), name);
    assert.equal(result.operationalProfitDisplay,null);
    assert.equal(result.reconciledProfitDisplay,null);
  }
});
