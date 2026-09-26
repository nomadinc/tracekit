import assert from "node:assert/strict";
import test from "node:test";
import {
  planGoogleAdsSync,
  runGoogleAdsSyncPlan,
  type GoogleSyncAccount,
} from "../lib/integrations/google-ads-sync-orchestrator";

const accounts:GoogleSyncAccount[]=[
 {id:"pa-a",connectionId:"conn-1",externalId:"1100000001",isManager:false,eligibleForSpendSync:true,selectedForSync:true,status:"active",loginCustomerIds:["1000000001"]},
 {id:"pa-b",connectionId:"conn-1",externalId:"1200000001",isManager:true,eligibleForSpendSync:false,selectedForSync:true,status:"active",loginCustomerIds:["1000000001"]},
 {id:"pa-c",connectionId:"conn-1",externalId:"1300000001",isManager:false,eligibleForSpendSync:true,selectedForSync:false,status:"active",loginCustomerIds:["1000000001"]},
];

test("sync plan targets only selected spend-eligible non-manager client accounts",()=>{
 const plan=planGoogleAdsSync({accounts,since:"2026-09-01",until:"2026-09-03",maxWindowDays:31});
 assert.deepEqual(plan.targets.map(x=>x.providerAccountId),["pa-a"]);
 assert.equal(plan.targets[0].loginCustomerId,"1000000001");
});

test("manual backfill splits into bounded inclusive date windows",()=>{
 const plan=planGoogleAdsSync({accounts:[accounts[0]],since:"2026-07-01",until:"2026-09-03",maxWindowDays:31});
 assert.deepEqual(plan.targets[0].windows,[
  {since:"2026-07-01",until:"2026-07-31"},
  {since:"2026-08-01",until:"2026-08-31"},
  {since:"2026-09-01",until:"2026-09-03"},
 ]);
});

test("incremental overlap re-fetches recent dates for provider restatements",()=>{
 const plan=planGoogleAdsSync({accounts:[accounts[0]],since:"2026-09-20",until:"2026-09-26",maxWindowDays:31,overlapDays:3});
 assert.equal(plan.effectiveSince,"2026-09-17");
 assert.deepEqual(plan.targets[0].windows,[{since:"2026-09-17",until:"2026-09-26"}]);
});

test("one client failure does not prevent sibling client completion",async()=>{
 const two=[accounts[0],{...accounts[0],id:"pa-d",externalId:"1400000001"}];
 const plan=planGoogleAdsSync({accounts:two,since:"2026-09-01",until:"2026-09-01",maxWindowDays:31});
 const result=await runGoogleAdsSyncPlan({plan,executeWindow:async({providerAccountId})=>{
  if(providerAccountId==="pa-a") throw new Error("provider failure");
  return {seen:2,persisted:2};
 }});
 assert.equal(result.accounts.find(x=>x.providerAccountId==="pa-a")?.status,"failed");
 assert.equal(result.accounts.find(x=>x.providerAccountId==="pa-d")?.status,"completed");
});

test("manager-only or unselected populations fail rather than creating empty success",()=>{
 assert.throws(()=>planGoogleAdsSync({accounts:[accounts[1],accounts[2]],since:"2026-09-01",until:"2026-09-03",maxWindowDays:31}),/selected spend-eligible/i);
});

test("daily backfill rejects ranges outside configured historical horizon",()=>{
 assert.throws(()=>planGoogleAdsSync({accounts:[accounts[0]],since:"2022-01-01",until:"2026-09-26",maxWindowDays:31,maxLookbackMonths:37,asOf:"2026-09-26"}),/historical horizon/i);
});
