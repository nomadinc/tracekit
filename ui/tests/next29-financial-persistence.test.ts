import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as writer from "../lib/commerce/next29-financial-persistence.ts";
import { createNext29HistoricalPersistence } from "../../api/src/connectors/next29/repository.ts";
import { normalizeNext29Order } from "../../api/src/connectors/next29/normalize.ts";
import { persistNext29Payments, persistNext29Refunds, persistNext29Order, next29RefundId, type FinancialRequest, type Next29FinancialInput } from "../lib/commerce/next29-financial-persistence.ts";
import { expandNext29Order } from "../../api/src/connectors/next29/expansion.ts";

// Local PostgreSQL engine only: reproduce the two production payment unique indexes.
// Reuse the WASM engine; reset every schema between sequential test cases.
let sharedDatabase:PGlite|undefined;
after(async()=>{await sharedDatabase?.close()});
async function fixture(t: {after(fn:()=>Promise<void>):void}, refundReferences:string[] = [], refundAmount="1") {
  const db = sharedDatabase ??= new PGlite();
  await db.exec("drop table if exists payment_transactions,commerce_refund_events,commerce_evidence_records,commerce_source_mappings,platform_orders cascade");
  await db.exec(`
    create table platform_orders(id bigint generated always as identity primary key,platform text,platform_order_id text unique,provider_order_id text,order_id text,account_id uuid,organization_id uuid,workspace_id text,connection_id uuid,provider_account_id uuid,canonical_order_id uuid,source_mapping_id uuid,evidence_id uuid,unique(connection_id,provider_account_id,provider_order_id));
    create table commerce_source_mappings(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,canonical_object_id uuid,canonical_object_type text,source_object_type text,source_object_id text,payload_hash text);
    create table commerce_evidence_records(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,source_object_type text,source_object_id text,payload_hash text,storage_reference text,deleted_at timestamptz);
    create table commerce_refund_events(id uuid primary key,account_id uuid not null,organization_id uuid not null,connection_id uuid not null,provider_account_id uuid not null,canonical_order_id uuid not null,evidence_id uuid not null,source_mapping_id uuid not null,provider_refund_id text not null,provider_payment_id text,amount float8,amount_gross float8,currency text,occurred_at timestamptz not null,unique(connection_id,provider_account_id,provider_refund_id));
    create table payment_transactions(id uuid primary key default gen_random_uuid(),platform text,transaction_id text,event_type text,account_id text,workspace_id text,parent_transaction_id text,order_id text,status text,amount float8,currency text,payment_method text,processor text,transaction_ts timestamptz,external_record_id text,transaction_event_code text,transaction_updated_at timestamptz,matched_platform_order_id text,fee_amount float8 default 0,net_amount float8 default 0,raw_json jsonb,unique(platform,account_id,transaction_id,event_type),unique(platform,account_id,external_record_id));
  `);
  const input:Next29FinancialInput={organizationId:randomUUID(),connectionId:randomUUID(),providerAccountId:randomUUID(),canonicalOrderId:randomUUID(),evidenceId:randomUUID(),sourceMappingId:randomUUID(),expansion:expandNext29Order({transactions:[{id:"tx",type:"debit",status:"succeeded",amount:"10",currency:"USD",external_id:"capture",date_created:"2026-10-01T00:00:00Z"}],refunds:[{id:7,total_refund_amount:"1",report_values:{currency:"USD"},created_at:"2026-10-02T00:00:00Z",transactions:[]}]})};
  input.expansion.refunds[0].transactionIds=refundReferences;
  input.expansion.refunds[0].amount=Number(refundAmount);
  const envelope={provider:"next29",resource:"order",sourceObjectId:"order",payload:{number:"order",refunds:[{id:7,total_refund_amount:refundAmount,report_values:{currency:"USD"},created_at:"2026-10-02T00:00:00Z",transactions:refundReferences.map(id=>({id}))}]}};
  const bytes=new TextEncoder().encode(JSON.stringify(envelope));
  const payloadHash=createHash("sha256").update(bytes).digest("hex");
  const storageReference=`commerce-evidence/${input.organizationId}/${input.connectionId}/${input.providerAccountId}/next29_order/${payloadHash}`;
  const accountId=randomUUID();
  const scope={organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId};
  const order={...scope,account_id:accountId,canonical_order_id:input.canonicalOrderId,source_mapping_id:input.sourceMappingId,evidence_id:input.evidenceId,platform:"next29",platform_order_id:"next29:order",provider_order_id:"order",order_id:"order",workspace_id:input.organizationId};
  const mapping={...scope,id:input.sourceMappingId,canonical_object_id:input.canonicalOrderId,canonical_object_type:"order",source_object_type:"next29_order",source_object_id:"order",payload_hash:payloadHash};
  const evidence={...scope,id:input.evidenceId,source_object_type:"next29_order",source_object_id:"order",payload_hash:payloadHash,storage_reference:storageReference,deleted_at:null};
  const traces:{path:string;method:string}[]=[];
  const request:FinancialRequest=async(path,init={})=>{
    traces.push({path,method:init.method||"GET"});
    const url=new URL(path,"https://local.invalid/");const table=url.pathname.slice(1);
    assert.match(table,/^[a-z_]+$/);
    const params:unknown[]=[];
    const ident=(s:string)=>{assert.match(s,/^[a-z_]+$/);return `"${s}"`;};
    const where:string[]=[];
    for(const [k,v]of Array.from(url.searchParams)){
      if(["select","limit"].includes(k))continue;
      let col:string;
      if(k.includes("->>")){const [a,b]=k.split("->>");assert.match(b,/^[a-z_]+$/);col=`${ident(a)}->>'${b}'`;}else col=ident(k);
      if(v==="is.null")where.push(`${col} is null`);
      else{assert.ok(v.startsWith("eq."));params.push(v.slice(3));where.push(`${col}=$${params.length}`);}
    }
    const filter=where.length?` where ${where.join(" and ")}`:"";
    const representation=(rows:Record<string,unknown>[])=>rows.map(row=>{
      const result={...row};
      for(const field of (url.searchParams.get("select")||"").split(",")){
        const cast=/^([a-z_]+)::text$/.exec(field);
        if(cast && result[cast[1]]!==null && result[cast[1]]!==undefined) result[cast[1]]=String(result[cast[1]]);
      }
      return result;
    });
    try{
      if(init.method==="POST")return representation((await insert(table,JSON.parse(String(init.body)))).rows as Record<string,unknown>[]);
      if(init.method==="PATCH"){
        const body=JSON.parse(String(init.body));const set=Object.entries(body).map(([k,v])=>{params.push(k==="raw_json"?JSON.stringify(v):v);return `${ident(k)}=$${params.length}`;}).join(",");
        return representation((await db.query(`update ${ident(table)} set ${set}${filter} returning *`,params)).rows as Record<string,unknown>[]);
      }
      return representation((await db.query(`select * from ${ident(table)}${filter} limit ${Number(url.searchParams.get("limit")||100)}`,params)).rows as Record<string,unknown>[]);
    }catch(error){throw Object.assign(new Error("Local constraint rejected write"),{databaseCode:(error as {code:string}).code});}
  };
  const evidenceBlobs=new Map([[storageReference,bytes]]);
  request.readEvidence=async args=>args.organizationId===input.organizationId ? evidenceBlobs.get(args.storageReference)?.slice() ?? null : null;
  async function insert(table:string,row:Record<string,unknown>){const keys=Object.keys(row);return db.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_,i)=>`$${i+1}`).join(",")}) returning *`,keys.map(k=>k==="raw_json"?JSON.stringify(row[k]):row[k]));}
  await insert("platform_orders",order);await insert("commerce_source_mappings",mapping);await insert("commerce_evidence_records",evidence);
  return {db,input,accountId,request,traces,order,insert,payloadHash,bytes,storageReference,evidenceBlobs};
}

test("before: retained numeric refund normalizes but old insert violates required ID/mapping",async t=>{
  const f=await fixture(t);assert.equal(f.input.expansion.refunds[0].providerRefundId,"7");
  await assert.rejects(()=>f.insert("commerce_refund_events",{account_id:f.accountId,organization_id:f.input.organizationId,connection_id:f.input.connectionId,provider_account_id:f.input.providerAccountId,canonical_order_id:f.input.canonicalOrderId,evidence_id:f.input.evidenceId,source_mapping_id:null,provider_refund_id:"7",occurred_at:"2026-10-02T00:00:00Z"}),{code:"23502"});
});
test("after: refund insert and concurrent replay produce one deterministic scoped row",async t=>{
  const f=await fixture(t);
  await Promise.all([persistNext29Refunds(f.request,f.accountId,f.input),persistNext29Refunds(f.request,f.accountId,f.input)]);
  const rows=(await f.db.query<any>("select * from commerce_refund_events")).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].id,next29RefundId(f.input,"7"));assert.equal(rows[0].source_mapping_id,f.input.sourceMappingId);assert.equal(rows[0].provider_payment_id,null);
});
test("refund replay preserves an existing scoped ID and all multiple source references",async t=>{
  const f=await fixture(t,["a","b"]);
  await persistNext29Refunds(f.request,f.accountId,f.input);const existing=randomUUID();await f.db.query("update commerce_refund_events set id=$1",[existing]);
  await persistNext29Refunds(f.request,f.accountId,f.input);
  const row=(await f.db.query<any>("select * from commerce_refund_events")).rows[0];assert.equal(row.id,existing);assert.equal(row.provider_payment_id,null);assert.deepEqual(f.input.expansion.refunds[0].transactionIds,["a","b"]);
});
for(const field of ["organizationId","connectionId","providerAccountId","canonicalOrderId","evidenceId","sourceMappingId"] as const)test(`foreign/missing ${field} denies refund and payment writes`,async t=>{
  const f=await fixture(t);const bad={...f.input,[field]:randomUUID()};
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,bad));await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,bad));
  assert.equal(f.traces.some(x=>x.method!=="GET"),false);
});
test("missing evidence, changed evidence hash and invalid refund money/timestamp fail closed",async t=>{
  const f=await fixture(t);await f.db.exec("update commerce_evidence_records set payload_hash=repeat('b',64)");
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
  await f.db.query("update commerce_evidence_records set payload_hash=$1",[f.payloadHash]);f.input.expansion.refunds[0].occurredAt=null;
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));f.input.expansion.refunds[0].occurredAt="2026-10-01T00:00:00Z";f.input.expansion.refunds[0].amount=null;
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
});
test("payment concurrent replay acknowledges one row, qualified null fees/net and complete scope",async t=>{
  const f=await fixture(t);await Promise.all([persistNext29Payments(f.request,f.accountId,f.input),persistNext29Payments(f.request,f.accountId,f.input)]);
  await persistNext29Payments(f.request,f.accountId,f.input);
  const rows=(await f.db.query<any>("select * from payment_transactions")).rows;assert.equal(rows.length,1);assert.equal(rows[0].fee_amount,null);assert.equal(rows[0].net_amount,null);assert.equal(rows[0].raw_json.organization_id,f.input.organizationId);
  for(const x of f.traces.filter(x=>x.method==="PATCH")){assert.match(x.path,/workspace_id=eq\./);assert.match(x.path,/account_id=eq\./);assert.match(x.path,/event_type=eq\./);assert.match(x.path,/raw_json->>connection_id=eq\./);assert.match(x.path,/raw_json->>provider_account_id=eq\./);assert.match(x.path,/raw_json->>organization_id=eq\./);}
});
test("same transaction ID with different event types remains separate",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);const next=structuredClone(f.input);next.expansion.transactions[0].type="refund";next.expansion.transactions[0].externalId="refund-reference";
  await persistNext29Payments(f.request,f.accountId,next);assert.equal((await f.db.query("select * from payment_transactions")).rows.length,2);
});
test("event identity unique index rejects foreign-workspace and legacy provenance adoption",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);await f.db.query("update payment_transactions set workspace_id=$1,raw_json='{}'",[randomUUID()]);
  await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,f.input));assert.equal(f.traces.filter(x=>x.method==="PATCH").length,0);
  const rows=(await f.db.query<any>("select * from payment_transactions")).rows;assert.equal(rows.length,1);assert.notEqual(rows[0].workspace_id,f.input.organizationId);
});
test("same reference with different event/transaction identity hits external-record unique index and stops",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);const other=structuredClone(f.input);other.expansion.transactions[0].providerTransactionId="different";other.expansion.transactions[0].type="refund";
  await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,other));assert.equal((await f.db.query("select * from payment_transactions")).rows.length,1);
});
test("same provider transaction in separate account remains distinct",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);const account=randomUUID();await f.db.query("update platform_orders set account_id=$1",[account]);await persistNext29Payments(f.request,account,f.input);
  assert.equal((await f.db.query("select * from payment_transactions")).rows.length,2);
});
test("scoped PATCH requires exactly one acknowledged row",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  await assert.rejects(()=>persistNext29Payments(async(path,init)=>init?.method==="PATCH"?[]:f.request(path,init),f.accountId,f.input));
});
test("global platform-order collision cannot reassign another tenant's order",async t=>{
  const f=await fixture(t);const changed={...f.order,organization_id:randomUUID(),workspace_id:randomUUID()};changed.workspace_id=changed.organization_id;
  await assert.rejects(()=>persistNext29Order(f.request,changed));assert.equal((await f.db.query<any>("select organization_id from platform_orders")).rows[0].organization_id,f.input.organizationId);
});
test("Stem and NH overlapping 103104 coexist without foreign lookup or reassignment",async t=>{
  const f=await fixture(t);await f.db.query("update platform_orders set provider_order_id='103104',platform_order_id='next29:103104'");
  const stem=(await f.db.query<any>("select * from platform_orders")).rows[0];
  const org=randomUUID(), connection=randomUUID(), provider=randomUUID(), canonical=randomUUID();
  const nh={...f.order,organization_id:org,workspace_id:org,connection_id:connection,provider_account_id:provider,canonical_order_id:canonical,provider_order_id:"103104",platform_order_id:"next29:103104"};
  f.traces.length=0;await persistNext29Order(f.request,nh);
  const rows=(await f.db.query<any>("select * from platform_orders order by id")).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows[0],stem);
  assert.equal(rows[1].platform_order_id,`next29:${org}:${connection}:${provider}:103104`);
  for(const trace of f.traces.filter(x=>x.method==='GET'))assert.ok(trace.path.includes(`organization_id=eq.${org}`));
  await persistNext29Order(f.request,nh);assert.equal((await f.db.query("select * from platform_orders")).rows.length,2);
});
test("legitimate order replay preserves the existing legacy bigint primary key",async t=>{
  const f=await fixture(t);await persistNext29Order(f.request,f.order);const rows=(await f.db.query<any>("select id from platform_orders")).rows;assert.equal(rows.length,1);assert.equal(String(rows[0].id),"1");
});
test("upsell marker retains its line without fabricating payment parent IDs",()=>{
  const e=expandNext29Order({lines:[{id:1,quantity:1,is_upsell:true}],transactions:[{id:1,type:"debit"}]});assert.equal(e.lines[0].isUpsell,true);assert.equal(e.transactions[0].parentTransactionId,null);
});

for (const [file,factory] of [["next29-runtime-persistence","createNext29RuntimePersistence"],["next29-live-validation","createPersistence"],["next29-webhook-canary","createOrderPersistence"]]) test(`actual ${file} adapter delegates payments/refunds with authoritative mapping and lineage`,async t=>{
  const f=await fixture(t);let captured:any;
  const source=readFileSync(new URL(`../lib/commerce/${file}.ts`,import.meta.url),"utf8")+`\nexport {${factory} as testFactory};`;
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  const dependencies=(name:string):any=>{
    if(name==="node:crypto")return {randomUUID};
    if(name==="./next29-financial-persistence")return writer;
    if(name==="./supabase-control-repository")return {commercePersistenceRequest:f.request,CommercePersistenceError:class extends Error{}};
    if(name.endsWith("/repository.ts"))return {createNext29HistoricalPersistence:(client:any)=>{captured=client;return client;}};
    if(name.endsWith("/subscription-repository.ts"))return {createNext29SubscriptionPersistence:()=>({})};
    if(name.endsWith("/dispute-repository.ts"))return {createNext29DisputePersistence:()=>({})};
    return {};
  };
  new Function("require","exports",code)(dependencies,exports);
  exports.testFactory({...f.input,accountId:f.accountId,environment:"staging",client:{}});
  assert.ok(captured);
  await captured.upsertTransactions(f.input);await captured.upsertRefunds(f.input);
  assert.equal((await f.db.query("select * from payment_transactions")).rows.length,1);
  assert.equal((await f.db.query<any>("select source_mapping_id from commerce_refund_events")).rows[0].source_mapping_id,f.input.sourceMappingId);
});

test("actual repository propagates authoritative mapping to every financial expansion write",async()=>{
  const seen:any[]=[];const raw={number:"order",date_placed:"2026-10-01T00:00:00Z",currency:"USD",transactions:[{id:"tx",type:"debit"}],refunds:[{id:7,created_at:"2026-10-02T00:00:00Z",total_refund_amount:"1",report_values:{currency:"USD"}}]};
  const repository=createNext29HistoricalPersistence({ensureOrderEvidence:async()=>({evidenceId:"evidence"}),ensureOrderSourceMapping:async()=>({id:"mapping",canonicalObjectId:"canonical"}),upsertPlatformOrder:async()=>{},upsertProducts:async()=>{},upsertOrderLines:async()=>{},upsertCustomerIdentity:async()=>{},upsertTransactions:async (input:Next29FinancialInput)=>{seen.push(input)},upsertRefunds:async (input:Next29FinancialInput)=>{seen.push(input)},upsertTransactionRelationships:async()=>{}} as any);
  await repository.persistOrder({organizationId:"org",connectionId:"connection",providerAccountId:"provider",syncRunId:"run",rawOrder:raw,normalized:normalizeNext29Order(raw),evidence:{storageReference:"retained",payloadHash:"a".repeat(64),byteSize:100}});
  assert.equal(seen.length,2);for(const x of seen){assert.equal(x.sourceMappingId,"mapping");assert.equal(x.evidenceId,"evidence");assert.equal(x.canonicalOrderId,"canonical");assert.equal(x.expansion.refunds[0].providerRefundId,"7");}
});

test("before: platform/transaction-only lookup can select a foreign account; corrected path cannot",async t=>{
  const f=await fixture(t);await f.insert("payment_transactions",{platform:"next29",account_id:"foreign",workspace_id:"foreign",transaction_id:"tx",event_type:"debit",raw_json:{}});
  const wrong=await f.request("payment_transactions?platform=eq.next29&transaction_id=eq.tx&select=id&limit=1");assert.equal(wrong[0].account_id,"foreign");
  await persistNext29Payments(f.request,f.accountId,f.input);
  const rows=(await f.db.query<any>("select account_id from payment_transactions")).rows;assert.equal(rows.length,2);assert.ok(rows.some(x=>x.account_id==="foreign"));
});

test("concurrent external-reference collisions accept one identity and never overwrite it",async t=>{
  const f=await fixture(t);const second=structuredClone(f.input);second.expansion.transactions[0].providerTransactionId="other-transaction";
  const results=await Promise.allSettled([persistNext29Payments(f.request,f.accountId,f.input),persistNext29Payments(f.request,f.accountId,second)]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(results.filter(x=>x.status==="rejected").length,1);assert.equal((await f.db.query("select * from payment_transactions")).rows.length,1);
});
test("foreign provider provenance in an existing same-account payment fails closed",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  await f.db.query("update payment_transactions set raw_json=jsonb_set(raw_json,'{provider_account_id}',to_jsonb($1::text))",[randomUUID()]);
  await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,f.input));assert.equal(f.traces.filter(x=>x.method==="PATCH").length,0);
});
test("deleted or foreign evidence and foreign source mapping cannot be used",async t=>{
  const f=await fixture(t);await f.db.exec("update commerce_evidence_records set deleted_at=now()");await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
  await f.db.query("update commerce_evidence_records set deleted_at=null,organization_id=$1",[randomUUID()]);await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
  await f.db.query("update commerce_evidence_records set organization_id=$1",[f.input.organizationId]);await f.db.query("update commerce_source_mappings set provider_account_id=$1",[randomUUID()]);await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,f.input));
  assert.equal(f.traces.some(x=>x.method!=="GET"),false);
});
test("ambiguous order lookup and multiple affected rows are rejected",async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>persistNext29Payments(async(path,init)=>{const rows=await f.request(path,init);return path.startsWith("platform_orders?")?[...rows,...rows]:rows;},f.accountId,f.input));
  await persistNext29Payments(f.request,f.accountId,f.input);
  await assert.rejects(()=>persistNext29Payments(async(path,init)=>{const rows=await f.request(path,init);return init?.method==="PATCH"?[...rows,...rows]:rows;},f.accountId,f.input));
});
test("explicit observed gross zero is retained while unobserved fee/net remain null",async t=>{
  const f=await fixture(t);f.input.expansion.transactions[0].amount=0;await persistNext29Payments(f.request,f.accountId,f.input);
  const row=(await f.db.query<any>("select * from payment_transactions")).rows[0];assert.equal(row.amount,0);assert.equal(row.fee_amount,null);assert.equal(row.net_amount,null);
});

for (const [fee,net] of [[2,8],[0,0]]) test(`SL-FIN-01 missing fee/net replay preserves observed ${fee}/${net} and full provenance`,async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  await f.db.query("update payment_transactions set fee_amount=$1,net_amount=$2,raw_json=raw_json || $3::jsonb",[fee,net,JSON.stringify({financial_completeness:{fee:"provider_observed",net:"provider_observed"},fee_provenance:{evidence:"accepted-enrichment",state:"observed"}})]);
  const before=(await f.db.query<any>("select * from payment_transactions")).rows[0];
  await persistNext29Payments(f.request,f.accountId,f.input);
  const after=(await f.db.query<any>("select * from payment_transactions")).rows[0];
  assert.equal(after.fee_amount,fee);assert.equal(after.net_amount,net);assert.deepEqual(after.raw_json,before.raw_json);
});
test("SL-FIN-01 insert defaults remain unavailable; replay does not promote historical defaults",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);await persistNext29Payments(f.request,f.accountId,f.input);
  const row=(await f.db.query<any>("select * from payment_transactions")).rows[0];assert.equal(row.fee_amount,null);assert.equal(row.net_amount,null);assert.deepEqual(row.raw_json.financial_completeness,{fee:"unavailable",net:"unavailable"});
});
for(const metadataOnly of [false,true])test(`SL-FIN-01 concurrent enrichment blocks stale replay (${metadataOnly?"metadata":"amounts and metadata"})`,async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);let changed=false;
  const racing:FinancialRequest=async(path,init)=>{
    if(init?.method==="PATCH" && !changed){changed=true;await f.db.exec(`update payment_transactions set ${metadataOnly?"":"fee_amount=0,net_amount=10,"}raw_json=jsonb_set(raw_json,'{financial_completeness}','{"fee":"provider_observed","net":"derived_complete","coverage_complete":true}'::jsonb)`);}
    return f.request(path,init);
  };
  await assert.rejects(()=>persistNext29Payments(racing,f.accountId,f.input));
  const row=(await f.db.query<any>("select * from payment_transactions")).rows[0];assert.equal(row.fee_amount,metadataOnly?null:0);assert.equal(row.net_amount,metadataOnly?null:10);assert.equal(row.raw_json.financial_completeness.net,"derived_complete");
});
test("SL-FIN-01 simultaneous stable replays preserve enriched financial evidence",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);await f.db.exec("update payment_transactions set fee_amount=2,net_amount=8,raw_json=jsonb_set(raw_json,'{financial_completeness}','{\"fee\":\"provider_observed\",\"net\":\"provider_observed\"}'::jsonb)");
  await Promise.all([persistNext29Payments(f.request,f.accountId,f.input),persistNext29Payments(f.request,f.accountId,f.input)]);
  const rows=(await f.db.query<any>("select * from payment_transactions")).rows;assert.equal(rows.length,1);assert.equal(rows[0].fee_amount,2);assert.equal(rows[0].net_amount,8);
});
test("SL-FIN-01 contradictory financial observations and gross changes require independent ordering authority",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  const extra=structuredClone(f.input);Object.assign(extra.expansion.transactions[0],{fee_amount:99});await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,extra));
  const gross=structuredClone(f.input);gross.expansion.transactions[0].amount=99;await assert.rejects(()=>persistNext29Payments(f.request,f.accountId,gross));
  const missing=structuredClone(f.input);missing.expansion.transactions[0].amount=null;missing.expansion.transactions[0].currency=null;await persistNext29Payments(f.request,f.accountId,missing);
  assert.equal((await f.db.query<any>("select amount from payment_transactions")).rows[0].amount,10);
});

for(const field of ["amount","currency","occurredAt","transactionIds"] as const)test(`SL-FIN-02 identical evidence rejects contradictory refund ${field} before mutation`,async t=>{
  const f=await fixture(t);await persistNext29Refunds(f.request,f.accountId,f.input);const contradictory=structuredClone(f.input);
  Object.assign(contradictory.expansion.refunds[0],{[field]:field==="amount"?99:field==="currency"?"EUR":field==="occurredAt"?"2026-10-03T00:00:00Z":["invented"]});
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,contradictory));
  const row=(await f.db.query<any>("select * from commerce_refund_events")).rows[0];assert.equal(row.amount,1);assert.equal(row.currency,"USD");assert.equal(row.provider_payment_id,null);assert.equal(f.traces.filter(x=>x.method==="PATCH").length,0);
});
test("SL-FIN-02 multiple reference sets cannot silently change while singular projection is null",async t=>{
  const f=await fixture(t,["a","b"]);await persistNext29Refunds(f.request,f.accountId,f.input);const changed=structuredClone(f.input);changed.expansion.refunds[0].transactionIds=["a","c"];
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,changed));
  const row=(await f.db.query<any>("select * from commerce_refund_events")).rows[0];assert.equal(row.amount,1);assert.equal(row.provider_payment_id,null);
});
test("SL-FIN-02 first projection cannot contradict verified retained amount",async t=>{
  const f=await fixture(t);const changed=structuredClone(f.input);changed.expansion.refunds[0].amount=99;await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,changed));assert.equal((await f.db.query("select * from commerce_refund_events")).rows.length,0);
});
test("SL-FIN-02 byte-hash mismatch, missing blob and out-of-scope storage reference fail closed",async t=>{
  const f=await fixture(t);f.evidenceBlobs.set(f.storageReference,new TextEncoder().encode("{}"));await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
  f.evidenceBlobs.clear();await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));f.evidenceBlobs.set(f.storageReference,f.bytes);
  await f.db.exec("update commerce_evidence_records set storage_reference='commerce-evidence/foreign/object'");await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));assert.equal(f.traces.some(x=>x.method!=="GET"),false);
});
test("SL-FIN-02 concurrent contradictory same-evidence replay cannot overwrite the accepted projection",async t=>{
  const f=await fixture(t);await persistNext29Refunds(f.request,f.accountId,f.input);const bad=structuredClone(f.input);bad.expansion.refunds[0].amount=99;
  const results=await Promise.allSettled([persistNext29Refunds(f.request,f.accountId,f.input),persistNext29Refunds(f.request,f.accountId,bad)]);assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(results.filter(x=>x.status==="rejected").length,1);assert.equal((await f.db.query<any>("select amount from commerce_refund_events")).rows[0].amount,1);
});
test("SL-FIN-02 distinct valid evidence cannot authorize a 1 to 99 financial change without ordering",async t=>{
  const f=await fixture(t);await persistNext29Refunds(f.request,f.accountId,f.input);
  const envelope=JSON.parse(new TextDecoder().decode(f.bytes));envelope.payload.refunds[0].total_refund_amount="99";
  const bytes=new TextEncoder().encode(JSON.stringify(envelope));const hash=createHash("sha256").update(bytes).digest("hex");const id=randomUUID();const reference=`commerce-evidence/${f.input.organizationId}/${f.input.connectionId}/${f.input.providerAccountId}/next29_order/${hash}`;f.evidenceBlobs.set(reference,bytes);
  await f.insert("commerce_evidence_records",{id,organization_id:f.input.organizationId,connection_id:f.input.connectionId,provider_account_id:f.input.providerAccountId,source_object_type:"next29_order",source_object_id:"order",payload_hash:hash,storage_reference:reference,deleted_at:null});
  await f.db.query("update platform_orders set evidence_id=$1",[id]);await f.db.query("update commerce_source_mappings set payload_hash=$1",[hash]);
  const updated={...structuredClone(f.input),evidenceId:id};updated.expansion.refunds[0].amount=99;
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,updated));const row=(await f.db.query<any>("select * from commerce_refund_events")).rows[0];assert.equal(row.amount,1);assert.equal(row.evidence_id,f.input.evidenceId);
});
test("SL-FIN-02 database NUMERIC contradictions are not rounded away or silently repaired",async t=>{
  const f=await fixture(t);await f.db.exec("alter table commerce_refund_events alter column amount type numeric,alter column amount_gross type numeric");
  await persistNext29Refunds(f.request,f.accountId,f.input);
  await f.db.exec("update commerce_refund_events set amount=1.0000000000000000001");
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));
  assert.equal((await f.db.query<any>("select amount::text as amount from commerce_refund_events")).rows[0].amount,"1.0000000000000000001");
});

test("exact financial read contract rejects decoded JSON numbers instead of trusting their rounded value",async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  const lossy:FinancialRequest=async(path,init)=>{const rows=await f.request(path,init);return path.startsWith("payment_transactions?") && !init?.method ? rows.map(row=>({...row,amount:Number(row.amount)})):rows;};
  await assert.rejects(()=>persistNext29Payments(lossy,f.accountId,f.input));assert.equal(f.traces.some(x=>x.method==="PATCH"),false);
});
for(const unsupported of ["NaN","Infinity",""," 0","0x10","1e2000"])test(`exact financial read rejects unsupported NUMERIC text ${JSON.stringify(unsupported)}`,async t=>{
  const f=await fixture(t);await persistNext29Payments(f.request,f.accountId,f.input);
  const invalid:FinancialRequest=async(path,init)=>{const rows=await f.request(path,init);return path.startsWith("payment_transactions?") && !init?.method ? rows.map(row=>({...row,fee_amount:unsupported})):rows;};
  await assert.rejects(()=>persistNext29Payments(invalid,f.accountId,f.input));assert.equal(f.traces.some(x=>x.method==="PATCH"),false);
});
test("retained decimal strings that the existing normalizer would round are rejected before first projection",async t=>{
  const f=await fixture(t,[],"1.0000000000000000001");await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));assert.equal((await f.db.query("select * from commerce_refund_events")).rows.length,0);
});
test("explicit decimal-string refund zero remains observed zero",async t=>{
  const f=await fixture(t,[],"0.0000");await persistNext29Refunds(f.request,f.accountId,f.input);await persistNext29Refunds(f.request,f.accountId,f.input);const rows=(await f.db.query<any>("select * from commerce_refund_events")).rows;assert.equal(rows.length,1);assert.equal(rows[0].amount,0);
});
test("native-shaped high-precision fee/net snapshots replay exactly without overwriting observed evidence",async t=>{
  const f=await fixture(t);await f.db.exec("alter table payment_transactions alter column fee_amount type numeric,alter column net_amount type numeric");await persistNext29Payments(f.request,f.accountId,f.input);await f.db.exec("update payment_transactions set fee_amount=1.0000000000000000001,net_amount=8.9999999999999999999");await persistNext29Payments(f.request,f.accountId,f.input);const row=(await f.db.query<any>("select fee_amount::text as fee,net_amount::text as net from payment_transactions")).rows[0];assert.equal(row.fee,"1.0000000000000000001");assert.equal(row.net,"8.9999999999999999999");
});
test("ambiguous numeric JSON refund source tokens are rejected rather than rounded",async t=>{
  const f=await fixture(t);const bytes=new TextEncoder().encode(new TextDecoder().decode(f.bytes).replace('"total_refund_amount":"1"','"total_refund_amount":1.0000000000000000001'));
  const hash=createHash("sha256").update(bytes).digest("hex");const reference=f.storageReference.replace(f.payloadHash,hash);f.evidenceBlobs.set(reference,bytes);
  await f.db.query("update commerce_evidence_records set payload_hash=$1,storage_reference=$2",[hash,reference]);await f.db.query("update commerce_source_mappings set payload_hash=$1",[hash]);
  await assert.rejects(()=>persistNext29Refunds(f.request,f.accountId,f.input));assert.equal((await f.db.query("select * from commerce_refund_events")).rows.length,0);
});
test("mutation acknowledgments with unsupported numeric representations are not accepted or automatically retried",async t=>{
  const f=await fixture(t);let posts=0;
  const invalid:FinancialRequest=async(path,init)=>{const rows=await f.request(path,init);if(init?.method==="POST"&&path.startsWith("payment_transactions")){posts++;return rows.map(row=>({...row,amount:Number(row.amount)}));}return rows;};
  await assert.rejects(()=>persistNext29Payments(invalid,f.accountId,f.input));assert.equal(posts,1);assert.equal(f.traces.some(x=>x.method==="PATCH"),false);
});
