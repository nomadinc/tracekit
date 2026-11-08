import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as financial from "../lib/financial-reconciliation.ts";
import { qualifiedFinancialAmount,financialEvidenceLabel } from "../lib/reporting/financial-evidence.ts";
import { netFinancialImpact,financialImpactRows,type FinancialReconciliationResponse } from "../lib/financial-reconciliation.ts";
import { reconcileStemPaypalReferences,STEM_PAYPAL_MERCHANT } from "../lib/commerce/next29-paypal-overlap.ts";
const response=(override:Partial<FinancialReconciliationResponse>={}):FinancialReconciliationResponse=>({partial:false,summary:{totals_by_type:{refund:{count:0,amount:0,currency:"USD",mixed_currency:false}}},...override} as FinancialReconciliationResponse);
test("observed and fully derived zero remain distinct from unavailable/restricted defaults",()=>{
  assert.equal(qualifiedFinancialAmount(0,"provider_observed"),0);assert.equal(qualifiedFinancialAmount(0,"derived_complete",true),0);assert.equal(qualifiedFinancialAmount(0,"derived_complete",false),null);
  for(const v of [null,undefined,"",false," ",Infinity])assert.equal(qualifiedFinancialAmount(v,"provider_observed"),null);
  assert.equal(qualifiedFinancialAmount(0,"unavailable"),null);assert.equal(financialEvidenceLabel(0,"restricted"),"Restricted");
});
test("empty event sets with unknown, incomplete or partial coverage cannot certify zero impact",()=>{
  for(const r of [response(),response({partial:true}),response({financial_coverage:{state:"incomplete",currency:"USD"}})]){assert.equal(netFinancialImpact(r).amount,null);assert.equal(financialImpactRows(r)[0].amount,null);}
});
test("complete currency-qualified empty event set may report derived zero",()=>{const r=response({financial_coverage:{state:"complete",currency:"USD"}});assert.equal(netFinancialImpact(r).amount,0);assert.equal(netFinancialImpact(r).currency,"USD");});
test("restricted financial results stay restricted; observed incomplete totals cannot certify a net",()=>{
  const r=response({financial_coverage:{state:"restricted",currency:null}});assert.equal(netFinancialImpact(r).label,"Restricted");assert.equal(netFinancialImpact(r).amount,null);assert.equal(financialImpactRows(r)[0].amount,null);
  const observed=response();observed.summary.totals_by_type.refund={count:1,amount:0,currency:"USD",mixed_currency:false};assert.equal(netFinancialImpact(observed).amount,0);assert.match(netFinancialImpact(observed).label,/Observed.*unverified/);
});
const scope={organizationId:"org",connectionId:"connection",providerAccountId:"provider",merchantId:STEM_PAYPAL_MERCHANT,merchantValidated:false};
const candidate={id:"n29",organizationId:"org",connectionId:"connection",providerAccountId:"provider",externalReference:"capture",amount:10,currency:"USD",status:"succeeded",eventType:"debit"};
const observation={id:"paypal-observation",organizationId:"org",merchantId:STEM_PAYPAL_MERCHANT,transactionId:"capture",amount:10,currency:"USD",status:"succeeded",kind:"capture" as const};
test("eleven retained PayPal references remain pending merchant validation without importing or combining totals",()=>{const rows=reconcileStemPaypalReferences(scope,Array.from({length:11},(_,i)=>({...candidate,id:String(i),externalReference:String(i)})),[]);assert.equal(rows.length,11);assert.ok(rows.every(r=>r.state==="merchant_validation_required"));});
test("exact-reference dry-run rejects cross-tenant/merchant, ambiguity, amount mismatch and refund conflation",()=>{
  const verified={...scope,merchantValidated:true};assert.equal(reconcileStemPaypalReferences(verified,[candidate],[observation])[0].state,"exact_candidate");
  for(const o of [{...observation,organizationId:"other"},{...observation,merchantId:"other"},{...observation,kind:"refund" as const}])assert.equal(reconcileStemPaypalReferences(verified,[candidate],[o])[0].state,"unresolved");
  assert.equal(reconcileStemPaypalReferences(verified,[candidate],[observation,{...observation,id:"duplicate"}])[0].state,"evidence_conflict");assert.equal(reconcileStemPaypalReferences(verified,[candidate],[{...observation,amount:9}])[0].state,"evidence_conflict");
  assert.equal(reconcileStemPaypalReferences(verified,[{...candidate,organizationId:"other"}],[observation])[0].state,"scope_conflict");
});

test("actual FinancialImpact component renders unavailable, restricted and complete zero distinctly",()=>{
  const source=readFileSync(new URL("../app/(app)/dashboard/financial-reconciliation/financial-reconciliation-client.tsx",import.meta.url),"utf8")+"\nexport {FinancialImpact as TestImpact};";
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};new Function("require","exports",code)((name:string)=>name==="react"?React:name==="react/jsx-runtime"?jsx:name==="@/lib/financial-reconciliation"?financial:name==="lucide-react"?{Banknote:()=>null}:{},exports);
  const unavailable=renderToStaticMarkup(React.createElement(exports.TestImpact,{data:response()}));assert.match(unavailable,/Unavailable/);assert.doesNotMatch(unavailable,/\$0\.00/);
  const restricted=renderToStaticMarkup(React.createElement(exports.TestImpact,{data:response({financial_coverage:{state:"restricted",currency:null}})}));assert.match(restricted,/Restricted/);assert.doesNotMatch(restricted,/\$0\.00/);
  const complete=renderToStaticMarkup(React.createElement(exports.TestImpact,{data:response({financial_coverage:{state:"complete",currency:"USD"}})}));assert.match(complete,/\$0\.00/);
});
