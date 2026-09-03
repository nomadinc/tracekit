import assert from "node:assert/strict";
import test from "node:test";
import { mergeOrdBackfillSummary, nextOrdBackfillCursor, normalizeOrdBackfillBatchSize, publicTransactionMappingRecordsFromPage } from "../lib/commerce/commas-public-transaction-backfill";

const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};
const transaction={id:"123",public_transaction_id:"ORD-abc",transaction_date:"2026-01-01T00:00:00Z",amount:10,fee_amount:1,net_amount:9,fan:{id:"fan"},product:{id:"product",title:"Product"},servicePayment:{id:"pay"},refunds:[]};

test("retained transaction Evidence produces exact ORD mapping inputs without api_metadata",()=>{
  const records=publicTransactionMappingRecordsFromPage({data:{transactions:[{...transaction,api_metadata:{affid:"must-not-be-attribution"}}]}},scope);
  assert.equal(records.length,1);assert.equal(records[0].transaction_id,"123");assert.equal(records[0].public_transaction_id,"ORD-abc");
  assert.equal("api_metadata" in records[0],false);
});

test("ORD backfill batches are bounded and cursor is stable",()=>{
  assert.equal(normalizeOrdBackfillBatchSize("50"),50);assert.throws(()=>normalizeOrdBackfillBatchSize(51),/1-50/);
  assert.deepEqual(nextOrdBackfillCursor([{observed_at:"2026-01-01",id:"a"},{observed_at:"2026-01-02",id:"b"}]),{observedAt:"2026-01-02",evidenceId:"b"});
});

test("ORD dry-run summaries aggregate every reconciliation class",()=>{
  assert.deepEqual(mergeOrdBackfillSummary({transactions_inspected:2,mappings_written:0},{transactions_inspected:3,valid_ord_identities:2,mappings_written:0}),{transactions_inspected:5,valid_ord_identities:2,unique_ord_identities:0,exact_order_matches:0,unmatched_transactions:0,ambiguous_ord_identities:0,duplicate_ord_identities:0,malformed_ord_identities:0,mappings_written:0});
});
