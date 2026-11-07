import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { authorizedDetailedFinancialOrganization } from "../lib/identity/financial-read-scope";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import { requirePermission } from "../lib/identity/authorization-gateway";
import * as platformPolicy from "../lib/platform/admin-policy";
import { randomUUID } from "node:crypto";

const session:any={ user:{id:"fixture",status:"active"}, membership:{userId:"fixture",role:"client-read-only",status:"active",organizationId:"stem",effectiveFrom:"2020-01-01T00:00:00Z"},activeAccount:{accountType:"client"},activeOrganization:{id:"stem"},availableOrganizations:[{id:"stem"}],effectivePermissions:[...ROLE_PERMISSIONS["client-read-only"]] };
function load(path:string, deps:Record<string,any>) {
 const source=readFileSync(new URL(path,import.meta.url),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m={exports:{} as any};
 new Function("require","module","exports",compiled)((name:string)=>{if(name==="react/jsx-runtime")return jsx;if(name in deps)return deps[name];throw Error(`Unapproved dependency ${name}`)},m,m.exports);
 return m.exports;
}
const json={NextResponse:{json:(body:any,init:any)=>Response.json(body,init)}};
async function render(node:any):Promise<string> {
 if(node==null)return "";
 if(Array.isArray(node))return (await Promise.all(node.map(render))).join("");
 if(typeof node!=="object")return String(node);
 if(typeof node.type==="function")return render(await node.type(node.props));
 if(node.type===React.Fragment||node.type===React.Suspense)return render(node.props.children);
 return renderToStaticMarkup(node);
}
for(const title of ["chargebacks","financial-reconciliation","chargebacks/exposure"]) {
 test(`actual ${title} page stops before mounting the financial caller for restricted or missing session`,async()=>{
  for(const identity of [session,null,{...session,membership:{...session.membership,status:"removed"}}]){
   let mounted=0;
   const Boundary=load("../components/money/detailed-financial-report-boundary.tsx",{
    "@/lib/identity/application-session":{resolveApplicationSession:async()=>identity?{kind:"authenticated",session:identity}:{kind:"unauthenticated"}},
    "@/lib/identity/financial-read-scope":{authorizedDetailedFinancialOrganization},
   }).DetailedFinancialReportBoundary;
   const Client=()=>{mounted++;return jsx.jsx("p",{children:"loaded-report"})};
   const Page=load(`../app/(app)/dashboard/${title}/page.tsx`,{
    "react":React,"@/components/money/detailed-financial-report-boundary":{DetailedFinancialReportBoundary:Boundary},
    "@/components/chargebacks/chargeback-review-workspace":{ChargebackReviewWorkspace:Client},
    "@/components/chargebacks/chargeback-exposure-workspace":{ChargebackExposureWorkspace:Client},
    "./financial-reconciliation-client":{__esModule:true,default:Client},
   }).default;
   assert.match(await render(Page()),/Detailed financial report restricted/); assert.equal(mounted,0);
  }
 });
}
test("valid detailed permission admits page while expired membership still denies",async()=>{
 for(const expired of [false,true]){
  const s={...session,effectivePermissions:[...session.effectivePermissions,"orders.view_financials"],membership:{...session.membership,...(expired?{effectiveUntil:"2020-01-02"}:{})}};
  const B=load("../components/money/detailed-financial-report-boundary.tsx",{"@/lib/identity/application-session":{resolveApplicationSession:async()=>({kind:"authenticated",session:s})},"@/lib/identity/financial-read-scope":{authorizedDetailedFinancialOrganization}}).DetailedFinancialReportBoundary;
  assert.equal((await render(await B({title:"Financial",children:"loaded-report"}))).includes("loaded-report"),!expired);
 }
});
test("actual financial APIs deny client before transport and reject foreign tenant",async()=>{
 let calls=0;
 const proxy=createScopedCoreProxy({resolveSession:async()=>({kind:"authenticated",session}),apiBaseUrl:()=>"https://core.example.test",adminSecret:()=>{calls++;return "fixture"},fetch:async()=>{calls++;return Response.json({})}});
 const finance=load("../app/api/financial-reconciliation/route.ts",{"next/server":json,"@/lib/identity/scoped-core-proxy":proxy,"@/lib/identity/core-read-projection":{projectCoreCustomerRead:(x:any)=>x}});
 const chargebacks=load("../app/api/chargebacks/route.ts",{"next/server":json,"@/lib/identity/application-session":{resolveApplicationSession:async()=>({kind:"authenticated",session})},"@/lib/identity/financial-read-scope":{authorizedDetailedFinancialOrganization},"@/lib/commerce/supabase-control-repository":{commercePersistenceRequest:()=>{calls++;throw Error("must not read")},commercePersistenceCount:()=>{calls++;throw Error("must not count")}},"@/lib/chargebacks/review":{parseReviewFilters:()=>({})},"@/lib/chargebacks/summary":{summaryFromExactCounts:()=>({})}});
 for(const route of [finance,chargebacks])for(const suffix of ["","?workspace_id=foreign"]){const r=await route.GET(new Request("https://ui.example.test/api/report"+suffix));assert.equal(r.status,404);assert.equal("summary" in await r.json(),false)}
 assert.equal(calls,0);
});
test("actual Chargebacks component renders missing/error states without fabricated zero counts",()=>{
 for(const error of [null,"API 404"]){
  const values=[1,null,null,null,error];let i=0;
  const C=load("../components/chargebacks/chargeback-review-workspace.tsx",{"react":{...React,useState:()=>[values[i++],()=>{}],useEffect:()=>{}},"next/link":{__esModule:true,default:"a"},"@/lib/api":{sameOriginGetJson:()=>{throw Error("SSR must not fetch")}},"@/lib/chargebacks/review":{MATCH_AUTHORITY_LABELS:{}}}).ChargebackReviewWorkspace;
  const html=renderToStaticMarkup(C());
  assert.doesNotMatch(html,/>0<|0 \/ 0/);
  if(error){assert.match(html,/Chargebacks unavailable/);assert.doesNotMatch(html,/Loading|Dispute portfolio/)}
 }
});
test("actual admin and connector mutation callers deny customer before RPC, repository or sync",async()=>{
 let effects=0;
 const deny=()=>{effects++;throw Error("forbidden side effect")};
 const common={"next/server":json,"@/lib/identity/application-session":{resolveApplicationSession:async()=>({kind:"authenticated",session})}};
 const admin=load("../app/api/platform/admin/route.ts",{...common,"@/lib/platform/admin-policy":platformPolicy,"@/lib/platform/platform-access":{assertCanonicalPlatformMembership:deny},"@/lib/platform/admin-repository":{adminRpc:deny}});
 const connector=load("../app/api/commerce/connections/[connectionId]/sync-now/route.ts",{...common,"node:crypto":{randomUUID},"@/lib/identity/authorization-gateway":{requirePermission},"@/lib/commerce/supabase-control-repository":{commercePersistenceRequest:deny},"@/lib/integrations/everflow-scheduled-worker":{runEverflowScheduledChunk:deny}});
 const request=()=>new Request("https://ui.example.test/api/test",{method:"POST",headers:{origin:"https://ui.example.test","content-type":"application/json"},body:JSON.stringify({action:"create",name:"must-not-create"})});
 assert.ok((await admin.POST(request())).status>=400);
 assert.ok((await connector.POST(request(),{params:Promise.resolve({connectionId:"fixture"})})).status>=400);
 assert.equal(effects,0);
});
