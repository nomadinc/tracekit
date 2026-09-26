import assert from "node:assert/strict";
import test from "node:test";
import { runGoogleAdsManualSyncCertification } from "../lib/integrations/google-ads-run-now";

test("Run Now completes one client while isolating a sibling provider failure", async () => {
  const events:any[]=[];
  const result=await runGoogleAdsManualSyncCertification({
    organizationId:"org",requestedByUserId:"user",
    accounts:[
      {id:"pa-ok",connectionId:"conn",externalId:"1210000001",isManager:false,eligibleForSpendSync:true,selectedForSync:true,status:"active",loginCustomerIds:["1000000001"]},
      {id:"pa-fail",connectionId:"conn",externalId:"1310000001",isManager:false,eligibleForSpendSync:true,selectedForSync:true,status:"active",loginCustomerIds:["1000000001"]},
    ],
    since:"2026-09-03",until:"2026-09-03",
    createRun:async x=>{events.push(["run",x.providerAccountId]);return{id:`run-${x.providerAccountId}`};},
    fetchReport:async x=>{
      if(x.customerId==="1310000001") throw new Error("google_provider_failure");
      return {rows:[{customer:{id:x.customerId,currencyCode:"USD",timeZone:"UTC"},campaign:{id:"10",status:"ENABLED"},adGroup:{id:"20",status:"ENABLED"},adGroupAd:{status:"ENABLED",ad:{id:"30"}},segments:{date:"2026-09-03"},metrics:{impressions:"2",clicks:"1",costMicros:"1000000"},tracekitGoogleContext:{requestId:"req-ok",loginCustomerId:x.loginCustomerId,customerId:x.customerId}}],requestIds:["req-ok"],pages:1};
    },
    persistRows:async x=>{events.push(["persist",x.providerAccountId,x.rawRows.length]);return{seen:1,created:1,updated:0,unchanged:0,evidenceCreated:1,costsCreated:1,costsUpdated:0};},
    checkpoint:async x=>{events.push(["checkpoint",x.providerAccountId,x.requestIds]);},
    finishRun:async x=>{events.push(["finish",x.providerAccountId,x.status]);},
  });
  assert.equal(result.accounts.find(x=>x.providerAccountId==="pa-ok")?.status,"completed");
  assert.equal(result.accounts.find(x=>x.providerAccountId==="pa-fail")?.status,"failed");
  assert.deepEqual(events.filter(x=>x[0]==="persist").map(x=>x[1]),["pa-ok"]);
  assert.deepEqual(events.filter(x=>x[0]==="checkpoint").map(x=>x[1]),["pa-ok"]);
  assert.ok(events.some(x=>x[0]==="finish"&&x[1]==="pa-fail"&&x[2]==="failed"));
});

test("Run Now does not touch schedules", async()=>{
 let scheduleTouched=false;
 await runGoogleAdsManualSyncCertification({
  organizationId:"org",requestedByUserId:"u",accounts:[{id:"pa",connectionId:"c",externalId:"1210000001",isManager:false,eligibleForSpendSync:true,selectedForSync:true,status:"active",loginCustomerIds:["1000000001"]}],since:"2026-09-03",until:"2026-09-03",
  createRun:async()=>({id:"run"}),fetchReport:async()=>({rows:[],requestIds:[],pages:1}),persistRows:async()=>({seen:0,created:0,updated:0,unchanged:0,evidenceCreated:0,costsCreated:0,costsUpdated:0}),checkpoint:async()=>{},finishRun:async()=>{},
  scheduleMutation:async()=>{scheduleTouched=true;},
 });
 assert.equal(scheduleTouched,false);
});
