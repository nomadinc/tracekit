import test from "node:test";
import assert from "node:assert/strict";
import { captureEverflowSourceInventory } from "../lib/integrations/everflow-source-inventory";

const hash="a".repeat(64);
const row=(id:string)=>({sourceIdentity:id,conversionId:id,networkId:"3453",currency:"USD",payloadHash:hash,rawPayloadHash:hash,conversionAt:"2026-10-02T04:30:00Z",isEvent:true,status:"rejected",advertiserId:"6"} as any);
const input={apiKey:"synthetic-secret-never-return",networkId:"3453",from:"2026-10-01 00:00:00",to:"2026-10-11 23:59:59",timezoneId:80,currencyId:"USD"};

test("bounded read includes all classes, builds deterministic identity/version manifests, excludes raw data and credentials",async()=>{
 const items=Array.from({length:1001},(_,i)=>row(String(i)));
 const calls:any[]=[];
 const a=await captureEverflowSourceInventory({...input,fetchPage:async p=>{calls.push(p);return {page:p.page!,pageSize:1000,totalCount:1001,conversions:items.slice((p.page!-1)*1000,p.page!*1000)};}});
 const b=await captureEverflowSourceInventory({...input,fetchPage:async p=>({page:p.page!,pageSize:1000,totalCount:1001,conversions:[...items].reverse().slice((p.page!-1)*1000,p.page!*1000)})});
 assert.equal(a.uniqueIdentities,1001);assert.equal(a.pages,2);assert.equal(a.identitySetSha256,b.identitySetSha256);assert.equal(a.normalizedVersionSetSha256,b.normalizedVersionSetSha256);
 assert.equal(a.classifications['event:rejected'],1001);assert.equal(a.advertisers['6'],1001);assert.equal(calls.every(p=>p.from===input.from&&p.to===input.to&&p.timezoneId===80&&p.currencyId==='USD'),true);
 assert.equal(a.stability,'single_bounded_read_requires_independent_repeat');assert.equal(a.readOnly,true);assert.doesNotMatch(JSON.stringify(a),/synthetic-secret|apiKey|rawPayload"/);
});

test("same totals with changed IDs or payload versions yield different commitments",async()=>{
 const capture=(r:any)=>captureEverflowSourceInventory({...input,fetchPage:async()=>({page:1,pageSize:1000,totalCount:1,conversions:[r]})});
 const a=await capture(row('a')),b=await capture(row('b')),c=await capture({...row('a'),payloadHash:'b'.repeat(64)});
 assert.notEqual(a.identitySetSha256,b.identitySetSha256);assert.equal(a.identitySetSha256,c.identitySetSha256);assert.notEqual(a.normalizedVersionSetSha256,c.normalizedVersionSetSha256);
});

test("duplicate or truncated pages, mutable totals, scope leakage and incorrect page metadata fail closed",async()=>{
 const full=Array.from({length:1000},(_,i)=>row(String(i)));
 const cases=[
  ["duplicate_identity",async()=>({page:1,pageSize:1000,totalCount:2,conversions:[row('a'),row('a')]})],
  ["truncated",async()=>({page:1,pageSize:1000,totalCount:2,conversions:[row('a')]})],
  ["population_changed",async(p:any)=>({page:p.page,pageSize:1000,totalCount:p.page===1?1001:1002,conversions:p.page===1?full:[row('next')]})],
  ["source_scope_unverified",async()=>({page:1,pageSize:1000,totalCount:1,conversions:[{...row('a'),networkId:'4179'}]})],
  ["paging_invalid",async()=>({page:2,pageSize:1000,totalCount:1,conversions:[row('a')]})],
  ["date_scope_unverified",async()=>({page:1,pageSize:1000,totalCount:1,conversions:[{...row('a'),conversionAt:'2026-10-12T04:00:00Z'}]})],
 ] as const;
 for(const [code,read] of cases)await assert.rejects(captureEverflowSourceInventory({...input,fetchPage:read as any}),new RegExp(code));
});
