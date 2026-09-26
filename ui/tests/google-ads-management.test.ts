import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleAdsManagementState } from "../lib/integrations/google-ads-management";

test("management state is organization-scoped and nests accounts by canonical parent", async()=>{
 const calls:string[]=[];
 const state=await buildGoogleAdsManagementState({organizationId:"org-1",transport:async path=>{
  calls.push(path);
  if(path.startsWith("marketing_provider_connections"))return[{id:"conn",organization_id:"org-1",account_id:"owner",provider:"google_ads",display_name:"Google A",status:"connected",reauthorization_required:false,capabilities:{}}];
  if(path.startsWith("marketing_provider_accounts"))return[
   {id:"root",connection_id:"conn",provider:"google_ads",provider_account_external_id:"1000000001",provider_account_label:"MCC",parent_provider_account_id:null,account_type:"manager",hierarchy_depth:0,is_manager:true,eligible_for_spend_sync:false,status:"active",selected_for_sync:false,metadata:{}},
   {id:"client",connection_id:"conn",provider:"google_ads",provider_account_external_id:"1100000001",provider_account_label:"Client",parent_provider_account_id:"root",account_type:"advertiser",hierarchy_depth:1,is_manager:false,eligible_for_spend_sync:true,status:"active",selected_for_sync:true,metadata:{}},
  ];
  return[];
 }});
 assert.equal(state.connections.length,1);
 assert.equal(state.connections[0].accounts[0].children[0].id,"client");
 assert.ok(calls.every(x=>x.includes("organization_id=eq.org-1")));
});

test("selection mutation rejects manager and cross-connection account IDs",async()=>{
 const writes:any[]=[];
 const transport:any=async(path:string,init:any={})=>{
  if((init.method||"GET")==="GET")return[
   {id:"manager",connection_id:"conn",provider:"google_ads",provider_account_external_id:"1000000001",account_type:"manager",is_manager:true,eligible_for_spend_sync:false,status:"active",selected_for_sync:false,metadata:{}},
   {id:"client",connection_id:"conn",provider:"google_ads",provider_account_external_id:"1100000001",account_type:"advertiser",is_manager:false,eligible_for_spend_sync:true,status:"active",selected_for_sync:false,metadata:{}},
  ];
  writes.push({path,body:JSON.parse(init.body)});return[{id:"client"}];
 };
 const { setGoogleAdsAccountSelection }=await import("../lib/integrations/google-ads-management");
 await assert.rejects(()=>setGoogleAdsAccountSelection({organizationId:"org",connectionId:"conn",selectedAccountIds:["manager"],transport}),/spend-eligible/i);
 await setGoogleAdsAccountSelection({organizationId:"org",connectionId:"conn",selectedAccountIds:["client"],transport});
 assert.ok(writes.some(x=>x.body.selected_for_sync===true));
});
