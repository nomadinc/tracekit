import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeOrdFrozenCohort, evidenceRangeQuery, evidenceRowsWithinWindow, mergeOrdBackfillSummary, nextOrdBackfillCursor, normalizeOrdBackfillBatchSize, ordFrozenBaselineFingerprint, publicTransactionMappingRecordsFromPage, validateOrdBackfillWindow, type ExistingSourceMapping, type OrdMappingRecord } from "../lib/commerce/commas-public-transaction-backfill";

const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};
const transaction={id:"123",public_transaction_id:"ORD-abc",transaction_date:"2026-01-01T00:00:00Z",amount:10,fee_amount:1,net_amount:9,fan:{id:"fan"},product:{id:"product",title:"Product"},servicePayment:{id:"pay"},refunds:[]};

test("retained transaction Evidence produces exact ORD mapping inputs without api_metadata",()=>{
  const records=publicTransactionMappingRecordsFromPage({data:{transactions:[{...transaction,api_metadata:{affid:"must-not-be-attribution"}}]}},scope);
  assert.equal(records.length,1);assert.equal(records[0].transaction_id,"123");assert.equal(records[0].public_transaction_id,"ORD-abc");
  assert.equal("api_metadata" in records[0],false);
});

test("ORD backfill batches are bounded and cursor is stable",()=>{
  assert.equal(normalizeOrdBackfillBatchSize("50"),50);assert.throws(()=>normalizeOrdBackfillBatchSize(51),/1-50/);
  assert.deepEqual(nextOrdBackfillCursor([{observed_at:"2026-01-01",id:"a"},{observed_at:"2026-01-02",id:"b"}]),{observedAt:"2026-01-02T00:00:00.000Z",evidenceId:"b"});
});

test("ORD dry-run summaries aggregate every reconciliation class",()=>{
  assert.deepEqual(mergeOrdBackfillSummary({transactions_inspected:2,mappings_written:0},{transactions_inspected:3,valid_ord_identities:2,mappings_written:0}),{transactions_inspected:5,valid_ord_identities:2,unique_ord_identities:0,exact_order_matches:0,unmatched_transactions:0,ambiguous_ord_identities:0,duplicate_ord_identities:0,malformed_ord_identities:0,mappings_written:0});
});

const ids=[1,2,3,4,5].map(value=>`00000000-0000-4000-8000-${String(value).padStart(12,"0")}`);
const at=(observed_at:string,id:string)=>({observed_at,id});

test("frozen horizon excludes live Evidence arriving after terminal completion",()=>{
  const window=validateOrdBackfillWindow({throughObservedAt:"2026-09-04T03:00:00Z",throughEvidenceId:ids[2]});
  const initial=[at("2026-09-04T01:00:00Z",ids[0]),at("2026-09-04T02:00:00Z",ids[1]),at("2026-09-04T03:00:00Z",ids[2])];
  const withLive=[...initial,at("2026-09-04T04:00:00Z",ids[3]),at("2026-09-04T05:00:00Z",ids[4])];
  assert.deepEqual(evidenceRowsWithinWindow(withLive,window),initial);
  assert.deepEqual(evidenceRowsWithinWindow(withLive,window),evidenceRowsWithinWindow(initial,window));
  assert.equal(nextOrdBackfillCursor(initial,window.through),null);
});

test("inclusive same-timestamp horizon uses Evidence UUID as deterministic tie breaker",()=>{
  const rows=ids.slice(0,4).map(id=>at("2026-09-04T03:00:00Z",id));
  const window=validateOrdBackfillWindow({throughObservedAt:"2026-09-04T03:00:00Z",throughEvidenceId:ids[2]});
  assert.deepEqual(evidenceRowsWithinWindow(rows,window).map(row=>row.id),ids.slice(0,3));
  assert.match(decodeURIComponent(evidenceRangeQuery(window)),/id\.lte\./);
});

test("lower cursor is exclusive and upper horizon is inclusive",()=>{
  const rows=ids.slice(0,4).map((id,index)=>at(`2026-09-04T0${index+1}:00:00Z`,id));
  assert.deepEqual(evidenceRowsWithinWindow(rows,validateOrdBackfillWindow({throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id})).map(row=>row.id),ids.slice(0,3));
  assert.deepEqual(evidenceRowsWithinWindow(rows,validateOrdBackfillWindow({afterObservedAt:rows[0].observed_at,afterEvidenceId:rows[0].id,throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id})).map(row=>row.id),ids.slice(1,3));
  assert.deepEqual(evidenceRowsWithinWindow(rows,validateOrdBackfillWindow({afterObservedAt:rows[1].observed_at,afterEvidenceId:rows[1].id,throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id})).map(row=>row.id),[ids[2]]);
  assert.deepEqual(evidenceRowsWithinWindow(rows,validateOrdBackfillWindow({afterObservedAt:rows[2].observed_at,afterEvidenceId:rows[2].id,throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id})),[]);
  assert.throws(()=>validateOrdBackfillWindow({afterObservedAt:rows[3].observed_at,afterEvidenceId:rows[3].id,throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id}),/must not sort after/);
  assert.throws(()=>validateOrdBackfillWindow({throughObservedAt:rows[2].observed_at}),/requires both/);
  assert.throws(()=>validateOrdBackfillWindow({throughObservedAt:"not-a-date",throughEvidenceId:ids[2]}),/valid timestamp/);
  assert.throws(()=>validateOrdBackfillWindow({throughObservedAt:rows[2].observed_at,throughEvidenceId:"not-a-uuid"}),/must be a UUID/);
  assert.throws(()=>validateOrdBackfillWindow({write:true}),/Write mode requires/);
  const query=decodeURIComponent(evidenceRangeQuery(validateOrdBackfillWindow({afterObservedAt:rows[0].observed_at,afterEvidenceId:rows[0].id,throughObservedAt:rows[2].observed_at,throughEvidenceId:rows[2].id})));
  assert.match(query,/observed_at\.gt\./);assert.match(query,/id\.gt\./);assert.match(query,/observed_at\.lt\./);assert.match(query,/id\.lte\./);
});

function record(ord:string,transactionId:string):OrdMappingRecord{return{public_transaction_id:ord,transaction_id:transactionId,transaction_at:"2026-09-04T00:00:00Z",payload_hash:"a".repeat(64)}}
function mapping(source_object_id:string,canonical_object_id:string):ExistingSourceMapping{return{source_object_id,canonical_object_id,state:"active"}}

test("global preflight deduplicates repeated pairs and detects cross-batch directional collisions",()=>{
  const numeric=[mapping("1",ids[0]),mapping("2",ids[1]),mapping("3",ids[2])];
  const repeated=analyzeOrdFrozenCohort({records:[record("ORD-A","1"),record("ORD-A","1")],numericMappings:numeric,ordMappings:[],evidenceHashChecked:2,evidenceHashFailures:0});
  assert.equal(repeated.acceptance_safe,true);assert.equal(repeated.unique_ord_identities,1);assert.equal(repeated.would_write_mappings,1);
  const ordCollision=analyzeOrdFrozenCohort({records:[record("ORD-A","1"),record("ORD-A","2")],numericMappings:numeric,ordMappings:[],evidenceHashChecked:2,evidenceHashFailures:0});
  assert.equal(ordCollision.ord_to_multiple_numeric_transaction_ids,1);assert.equal(ordCollision.acceptance_safe,false);
  const transactionCollision=analyzeOrdFrozenCohort({records:[record("ORD-A","1"),record("ORD-B","1")],numericMappings:numeric,ordMappings:[],evidenceHashChecked:2,evidenceHashFailures:0});
  assert.equal(transactionCollision.numeric_transaction_id_to_multiple_ord_identities,1);assert.equal(transactionCollision.acceptance_safe,false);
  const orderCollision=analyzeOrdFrozenCohort({records:[record("ORD-A","1"),record("ORD-A","2")],numericMappings:[mapping("1",ids[0]),mapping("2",ids[1])],ordMappings:[],evidenceHashChecked:2,evidenceHashFailures:0});
  assert.equal(orderCollision.ord_to_multiple_canonical_orders,1);assert.equal(orderCollision.acceptance_safe,false);
  const existingConflict=analyzeOrdFrozenCohort({records:[record("ORD-A","1")],numericMappings:[mapping("1",ids[0])],ordMappings:[mapping("ORD-A",ids[1])],evidenceHashChecked:1,evidenceHashFailures:0});
  assert.equal(existingConflict.existing_conflicting_commas_public_transaction_mappings,1);assert.equal(existingConflict.acceptance_safe,false);
});

test("missing ORD values are not malformed and remain outside the identity cohort",()=>{
  const result=analyzeOrdFrozenCohort({records:[record("","1"),record("ORD-A","")],numericMappings:[],ordMappings:[],evidenceHashChecked:1,evidenceHashFailures:0});
  assert.equal(result.ord_observations,1);assert.equal(result.malformed_ord_identities,0);assert.equal(result.unique_ord_identities,1);assert.equal(result.unmatched_ord_identities,1);assert.equal(result.acceptance_safe,true);
});

test("frozen write planning is idempotent and post-horizon rows do not alter its baseline",()=>{
  const numeric=[mapping("1",ids[0])],records=[record("ORD-A","1")];
  const first=analyzeOrdFrozenCohort({records,numericMappings:numeric,ordMappings:[],evidenceHashChecked:1,evidenceHashFailures:0});
  const second=analyzeOrdFrozenCohort({records,numericMappings:numeric,ordMappings:[mapping("ORD-A",ids[0])],evidenceHashChecked:1,evidenceHashFailures:0});
  assert.equal(first.would_write_mappings,1);assert.equal(second.would_write_mappings,0);assert.equal(second.already_existing_idempotent_mappings,1);
  const material={window:{through:{observedAt:"2026-09-04T03:00:00Z",evidenceId:ids[2]}},records};
  assert.equal(ordFrozenBaselineFingerprint(material),ordFrozenBaselineFingerprint(material));
});

test("hash failures and malformed ORD identities fail closed before writes",()=>{
  const result=analyzeOrdFrozenCohort({records:[record("not-an-ord","1")],numericMappings:[mapping("1",ids[0])],ordMappings:[],evidenceHashChecked:0,evidenceHashFailures:1});
  assert.equal(result.evidence_hash_failures,1);assert.equal(result.malformed_ord_identities,1);assert.equal(result.acceptance_safe,false);
});

test("ORD planner has no attribution or financial mutation surface",()=>{
  const source=readFileSync(new URL("../scripts/backfill-commas-public-transaction-identities.ts",import.meta.url),"utf8");
  assert.match(source,/rpc\/upsert_commas_public_transaction_mappings_v1/);
  for(const forbidden of ["commerce_provider_attribution_observations","commerce_provider_attribution_webhook_deliveries","journey_events","journey_attribution_credits","commerce_order_economic_lines","commerce_refund_events"])assert.doesNotMatch(source,new RegExp(forbidden));
  assert.doesNotMatch(source,/fanbasis|public-api/);
});
