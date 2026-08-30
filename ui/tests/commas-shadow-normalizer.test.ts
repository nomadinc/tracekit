import assert from "node:assert/strict";
import test from "node:test";
import { deterministicUuid, normalizeCommasTransaction, normalizeEmail, normalizePhone, normalizeRefunds, refundSchemaObservations } from "../lib/commerce/commas-shadow-normalizer";

const transaction = { id:"tx-synthetic",transaction_date:"2026-01-02T03:04:05Z",fan:{id:"fan-synthetic",name:"Synthetic Person",email:" TEST@EXAMPLE.COM ",phone:"(555) 010-2222"},product:{id:"product-synthetic",title:"Synthetic Product",price:"99.00",payment_link:"https://example.invalid/synthetic"},servicePayment:{id:"payment-synthetic",payment_type:"card",fund_release_on:"2026-01-04T00:00:00Z",fund_released:false},amount:"99",fee_amount:"3",net_amount:"96",refunds:[] };

test("Transaction normalization is deterministic and preserves verified financial vocabulary",()=>{
  const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};
  const first=normalizeCommasTransaction(transaction,scope); const second=normalizeCommasTransaction(transaction,scope);
  assert.deepEqual(first,second); assert.equal(first.gross_amount,"99"); assert.equal(first.provider_fee,"3"); assert.equal(first.provider_net,"96"); assert.equal(first.currency,null);
  assert.match(first.platform_order_id,/^commas:/); assert.equal(first.customer_email,"test@example.com"); assert.equal(first.customer_phone,"+5550102222");
  assert.notEqual(first.payment_link_hash,transaction.product.payment_link); assert.equal(deterministicUuid("same"),deterministicUuid("same"));
});

test("provider Product identity is immutable across renames and shared across distinct Transactions",()=>{
  const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};
  const first=normalizeCommasTransaction(transaction,scope);
  const renamed=normalizeCommasTransaction({...transaction,product:{...transaction.product,title:"Renamed description"}},scope);
  const upsell=normalizeCommasTransaction({...transaction,id:"tx-upsell"},scope);
  assert.equal(first.product_uuid,renamed.product_uuid);
  assert.notEqual(first.payload_hash,renamed.payload_hash);
  assert.equal(first.product_uuid,upsell.product_uuid);
  assert.notEqual(first.canonical_order_id,upsell.canonical_order_id);
  assert.notEqual(first.order_line_id,upsell.order_line_id);
});

test("unknown Product IDs remain distinct and missing immutable Product identity fails closed",()=>{
  const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};
  const first=normalizeCommasTransaction(transaction,scope);
  const unknown=normalizeCommasTransaction({...transaction,product:{...transaction.product,id:"new-provider-product",title:"Synthetic Product"}},scope);
  assert.notEqual(first.product_uuid,unknown.product_uuid);
  assert.throws(()=>normalizeCommasTransaction({...transaction,product:{title:"Same name",price:"99"}},scope),/identity is incomplete/);
});

test("Customer contact signals normalize without becoming merge keys",()=>{ assert.equal(normalizeEmail(" A@Example.COM "),"a@example.com"); assert.equal(normalizePhone("+1 (555) 111-2222"),"+15551112222"); assert.equal(normalizePhone("12"),null); });
test("Refund discovery reports field names and types only",()=>{ assert.deepEqual(refundSchemaObservations([{...transaction,refunds:[{id:"hidden",amount:10,status:null}]}]),{amount:"number",id:"string",status:"null"}); assert.equal(refundSchemaObservations([transaction]),null); });
test("verified embedded Refunds normalize deterministically and unknown fields fail closed",()=>{const source={...transaction,refunds:[{id:1,payment_id:2,amount:10,amount_gross:10,fee:1,refund_cost:1,created_at:"2026-01-03T00:00:00Z"}]};const scope={connectionId:"00000000-0000-0000-0000-000000000001",providerAccountId:"00000000-0000-0000-0000-000000000002"};assert.deepEqual(normalizeRefunds(source,scope),normalizeRefunds(source,scope));assert.equal(normalizeRefunds(source,scope)[0].amount,"10");assert.throws(()=>normalizeRefunds({...source,refunds:[{...source.refunds[0],unexpected:"x"}]},scope),/schema changed/);});
