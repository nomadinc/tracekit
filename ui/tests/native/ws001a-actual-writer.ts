import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expandNext29Order } from "../../../api/src/connectors/next29/expansion.ts";
import { persistNext29Order, persistNext29Payments, type FinancialRequest } from "../../lib/commerce/next29-financial-persistence.ts";

const base = "http://127.0.0.1:3000";
const root = process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceDir = resolve(root,"acceptance-logs");
mkdirSync(evidenceDir,{recursive:true});
const log = resolve(evidenceDir,"actual-writer-http.jsonl");
const audit = (v:unknown) => appendFileSync(log,JSON.stringify(v)+"\n");
const eq=(k:string,v:string)=>k+"=eq."+encodeURIComponent(v);
const stemAccount="11111111-1111-4111-8111-111111111111";
const stemOrg="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stemConnection="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const stemProvider="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac";
const stemCanonical="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad";
const stemEvidence="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae";
const stemMapping=randomUUID();
async function http(path:string,init:RequestInit={}) {
  const method=init.method??"GET";
  const url=base+"/"+path;
  const response=await fetch(url,{...init,headers:{"Content-Type":"application/json","Prefer":"return=representation",...(init.headers??{})}});
  const raw=await response.text();
  audit({method,path,status:response.status,contentRange:response.headers.get("content-range"),body:raw});
  if(!response.ok){let payload:any={};try{payload=JSON.parse(raw)}catch{}
    throw Object.assign(new Error("PostgREST HTTP "+response.status+" "+raw),{databaseCode:payload.code,status:response.status});}
  return raw?JSON.parse(raw):[];
}
const request:FinancialRequest=async(path,init)=>http(path,init);
function record(scope:{account:string,org:string,connection:string,provider:string,canonical:string,evidence:string,mapping:string},legacy=false){
  return {platform:"next29",platform_order_id:legacy?"102872":"untrusted-input",
    provider_order_id:"102872",order_id:"102872",account_id:scope.account,
    organization_id:scope.org,workspace_id:scope.org,connection_id:scope.connection,
    provider_account_id:scope.provider,canonical_order_id:scope.canonical,
    source_mapping_id:scope.mapping,evidence_id:scope.evidence};
}
async function provenance(s:{org:string,connection:string,provider:string,canonical:string,evidence:string,mapping:string}){
  const hash=createHash("sha256").update("synthetic-ws001a-"+s.canonical).digest("hex");
  await http("commerce_source_mappings",{method:"POST",body:JSON.stringify({
    id:s.mapping,organization_id:s.org,connection_id:s.connection,provider_account_id:s.provider,
    canonical_object_id:s.canonical,canonical_object_type:"order",source_object_type:"next29_order",
    source_object_id:"102872",payload_hash:hash})});
  await http("commerce_evidence_records",{method:"POST",body:JSON.stringify({
    id:s.evidence,organization_id:s.org,connection_id:s.connection,provider_account_id:s.provider,
    source_object_type:"next29_order",source_object_id:"102872",payload_hash:hash,
    storage_reference:"commerce-evidence/"+s.org+"/"+s.connection+"/"+s.provider+"/next29_order/"+hash,
    deleted_at:null})});
}
const stem={account:stemAccount,org:stemOrg,connection:stemConnection,provider:stemProvider,canonical:stemCanonical,evidence:stemEvidence,mapping:stemMapping};
const nh={account:randomUUID(),org:randomUUID(),connection:randomUUID(),provider:randomUUID(),canonical:randomUUID(),evidence:randomUUID(),mapping:randomUUID()};
await provenance(stem);
await provenance(nh);
const stemRows=await http("platform_orders?"+eq("provider_order_id","102872")+"&"+eq("account_id",stemAccount));
assert.equal(stemRows.length,1);
const stemId=stemRows[0].id;
await http("platform_orders?"+eq("id",String(stemId)),{method:"PATCH",body:JSON.stringify({
 workspace_id:stemOrg,source_mapping_id:stemMapping,order_id:"102872"})});
const legacy=record(stem,true);
await persistNext29Order(request,legacy);
const before=await http("platform_orders?"+eq("id",String(stemId)));
assert.equal(before[0].platform_order_id,"102872");
const nhOrder=record(nh);
await Promise.all([persistNext29Order(request,nhOrder),persistNext29Order(request,nhOrder)]);
await persistNext29Order(request,nhOrder);
const orders=await http("platform_orders?"+eq("provider_order_id","102872")+"&select=id,platform_order_id,account_id,canonical_order_id");
assert.equal(orders.length,2);
const stemAfter=orders.find((r:any)=>r.account_id===stemAccount);
const nhAfter=orders.find((r:any)=>r.account_id===nh.account);
assert.equal(stemAfter.id,stemId);
assert.equal(stemAfter.platform_order_id,"102872");
assert.match(nhAfter.platform_order_id,/^next29:scoped:[0-9a-f]{64}$/);
assert.equal(nhAfter.canonical_order_id,nh.canonical);
await assert.rejects(()=>persistNext29Order(request,{...nhOrder,canonical_order_id:randomUUID()}));
const input=(s:typeof stem)=>({organizationId:s.org,connectionId:s.connection,providerAccountId:s.provider,
 canonicalOrderId:s.canonical,evidenceId:s.evidence,sourceMappingId:s.mapping,
 expansion:expandNext29Order({number:"102872",transactions:[{id:"2446",type:"debit",status:"succeeded",
 amount:"19.99",currency:"USD",external_id:"2446-nh",date_created:"2026-10-01T00:00:00Z"}],refunds:[]})});
const stemPayment=await http("payment_transactions?"+eq("transaction_id","2446")+"&"+eq("account_id",stemAccount));
assert.equal(stemPayment.length,1);
const stemPaymentId=stemPayment[0].id;
await assert.rejects(()=>persistNext29Payments(request,stemAccount,input(stem)));
const preserved=await http("payment_transactions?"+eq("id",stemPaymentId));
assert.equal(preserved[0].id,stemPaymentId);
assert.equal(preserved[0].raw_json,null);
await Promise.all([persistNext29Payments(request,nh.account,input(nh)),persistNext29Payments(request,nh.account,input(nh))]);
await persistNext29Payments(request,nh.account,input(nh));
const payments=await http("payment_transactions?"+eq("transaction_id","2446")+"&select=id,account_id,transaction_id,event_type,raw_json,amount,fee_amount,net_amount");
assert.equal(payments.length,2);
assert.equal(payments.find((r:any)=>r.account_id===stemAccount).id,stemPaymentId);
assert.equal(payments.find((r:any)=>r.account_id===nh.account).raw_json.connection_id,nh.connection);
const bad={...input(nh),connectionId:randomUUID()};
await assert.rejects(()=>persistNext29Payments(request,nh.account,bad));
writeFileSync(resolve(evidenceDir,"actual-writer-summary.json"),JSON.stringify({
 status:"PASS",stemOrderId:stemId,stemPaymentId,nhOrderId:nhAfter.id,
 nhPaymentId:payments.find((r:any)=>r.account_id===nh.account).id,
 orderCount:orders.length,paymentCount:payments.length,
 tested:["accepted order writer","accepted payment writer","legacy preservation","scoped order","replay","concurrent promises","foreign connection rejection","ambiguous legacy payment fail-closed"]
},null,2));
console.log("WS001A ACTUAL WRITER HTTP TEST PASS");
