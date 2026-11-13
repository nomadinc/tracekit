import test from "node:test";
import assert from "node:assert/strict";
import { purchaseEvidenceDrawer } from "../lib/orders/context-drawer";
import { observedOrderLines } from "../lib/orders/observed-lines";
test("reference Order snapshot presents canonical purchase evidence without financial inference",()=>{
 const canonical="15f0b290-aaad-4962-b1d6-42f69db3966c",journey="bc1e677e-173c-51ad-b00c-e78b4ba77ef6",org="8f6bb14b-2126-49b8-bfdb-c60edbc3549b",id="857d4b1f-5724-424e-8ca5-d777ec050119";
 const snapshot:any={order:{id:"next29:103104",customerId:"person",revenue:116.99,currency:"USD",profit:null},canonicalOrderId:canonical,canonicalJourneyId:journey,observedReferences:{payment:"payment",evidence:"proof"},observedLines:observedOrderLines([{id:"line",organization_id:org,canonical_order_id:canonical,product_name:"20 Treatments (5)",quantity:1,unit_amount:116.99,currency:"USD",evidence_id:"line-proof"}],canonical,org)};
 const event:any={id,status:"Observed",confidence:"Observed evidence",evidence:[],relationships:[],purchaseEvidence:{provider:"next29",observedAt:"2026-01-01T00:00:00Z"}};
 const drawer=purchaseEvidenceDrawer(snapshot,event,`event:${id}`);
 for(const expected of [canonical,journey,id,"$116.99 USD","20 Treatments (5)","line-proof","payment"])assert.ok(JSON.stringify(drawer).includes(expected),expected);
 assert.ok(drawer.facts.some(f=>f.label==="SKU 1"&&f.value==="Unavailable"));assert.equal(drawer.amount,undefined);assert.equal(drawer.links?.length,1);
 snapshot.order.revenue=null;snapshot.observedLines=[];snapshot.canonicalJourneyId=null;
 const missing=purchaseEvidenceDrawer(snapshot,event,"event:missing");assert.ok(missing.facts.some(f=>f.label==="Purchase amount"&&f.value==="Unavailable USD"));assert.equal(missing.links?.length,0);
});
