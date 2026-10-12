import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditCustomerSourceEvidence} from "../lib/commerce/customer-source-evidence-audit";
import {normalizeCommasTransaction} from "../lib/commerce/commas-shadow-normalizer";

test("customer audit distinguishes absent source fields from usable retained contacts without values or writes",async()=>{
 const scope={organizationId:"tenant",connectionId:"connection",providerAccountId:"provider",externalMerchantIdentityVerified:false};
 const items=[{id:1,transaction_date:"2026-10-02T12:00:00Z",fan:{id:1,name:"Private Name",phone:"16098896632",email:"private@example.invalid"},product:{id:1},amount:67},{id:2,transaction_date:"2026-10-02T12:00:00Z",fan:{id:2,name:null,phone:null,email:"other@example.invalid"},product:{id:1},amount:67}];
 const normalized=items.map(item=>normalizeCommasTransaction(item,scope));
 const evidence="11111111-1111-1111-1111-111111111111";
 const bytes=new TextEncoder().encode(JSON.stringify({transactions:items}));const hash=createHash("sha256").update(bytes).digest("hex");
 const reference=`commerce-evidence/tenant/connection/provider/transaction_page/${hash}`;
 const paths:string[]=[];
 const db=async(path:string,init?:unknown)=>{assert.equal(init,undefined);paths.push(path);if(path.startsWith('people?'))return normalized.map((row,i)=>({id:row.person_id,organization_id:"tenant",primary_phone:null,display_name:i?null:"known"}));if(path.startsWith('platform_orders?'))return normalized.map((row,i)=>({id:i+1,person_id:row.person_id,canonical_order_id:row.canonical_order_id,platform_order_id:row.platform_order_id,evidence_id:evidence}));return[{id:evidence,organization_id:"tenant",connection_id:"connection",provider_account_id:"provider",storage_reference:reference,payload_hash:hash}];};
 const store:any={async getAuthorized(){return bytes},async verifyHash(){return true},async putImmutable(){throw Error('write forbidden')}};
 const result=await auditCustomerSourceEvidence(scope,{db,store});
 assert.equal(result.providerRequests,0);assert.equal(result.writes,0);assert.equal(result.candidates,2);assert.equal(result.retainedOrdersVerified,2);assert.equal(result.evidencePagesVerified,1);assert.equal(result.assessments.usable_phone_in_retained_source,1);assert.equal(result.assessments.phone_absent_from_retained_source,1);assert.equal(result.assessments.name_absent_from_retained_source,1);
 assert.doesNotMatch(JSON.stringify(result),/Private Name|16098896632|example\.invalid/);
 assert.ok(paths.every(path=>path.includes('organization_id=eq.tenant')));
 await assert.rejects(auditCustomerSourceEvidence(scope,{db:async()=>[{id:normalized[0].person_id,organization_id:'other'}],store}),/customer_source_evidence_unverified/);
 await assert.rejects(auditCustomerSourceEvidence(scope,{db,store:{...store,async verifyHash(){return false}}}),/customer_source_evidence_unverified/);
});
