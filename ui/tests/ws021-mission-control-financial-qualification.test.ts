import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { qualifyFinancialMetric } from "../lib/mission-control/financial-qualification";
import { readMissionControlPortfolio } from "../lib/mission-control/portfolio-reader";
import { PortfolioKpis } from "../components/mission-control/portfolio-kpis";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";
const org={id:"stem",name:"Stem Labs"};
const session={user:{status:"active"},membership:{status:"active"},activeOrganization:org,availableOrganizations:[org],effectivePermissions:["financials.view"]} as TraceKitSessionContext;
for (const kind of ["refund","chargeback"] as const) {
 test(`${kind}: absent and partial coverage never certifies zero or a total`,()=>{
  for(const coverage of ["unknown","partial"] as const) for(const rows of [[],[{amount:0,currency:"USD"}],[{amount:25,currency:"USD"}]]) {
   const m=qualifyFinancialMetric(rows,coverage,kind);assert.equal(m.value,null);assert.equal(m.state,"partial");
  }
 });
 test(`${kind}: certified zero and verified nonzero preserve aggregation`,()=>{
  for(const rows of [[],[{amount:"0",currency:"USD"}]]) assert.deepEqual(qualifyFinancialMetric(rows,"complete",kind).value,0);
  assert.equal(qualifyFinancialMetric([{amount:"-12.50",currency:"USD"},{amount:"-2.25",currency:"USD"}],"complete",kind).value,14.75);
  assert.equal(qualifyFinancialMetric([],"complete",kind).state,"available");
 });
 test(`${kind}: missing or malformed financial fields never coerce to zero`,()=>{
  for(const amount of [undefined,null,"", " ",false,"bad",NaN,Infinity,{},[]]) assert.equal(qualifyFinancialMetric([{amount,currency:"USD"}],"complete",kind).value,null);
  for(const currency of [undefined,null,"EUR"]) assert.equal(qualifyFinancialMetric([{amount:0,currency}],"complete",kind).value,null);
 });
}
test("actual Stem reader and cards remove false verification while preserving revenue and count",async()=>{
 const paths:string[]=[];
 const portfolio=await readMissionControlPortfolio(session,30,{request:async path=>{paths.push(path);return path.startsWith("platform_orders?")?[{gross_amount:25,currency:"USD"}]:[];},count:async()=>0});
 assert.ok(portfolio);assert.equal(portfolio.metrics.revenue.value,25);
 for(const k of ["refunds","chargebacks"] as const){assert.equal(portfolio.metrics[k].value,null);assert.equal(JSON.parse(JSON.stringify(portfolio)).metrics[k].value,null);}
 assert.ok(paths.every(p=>p.includes("organization_id=eq.stem")));
 const html=renderToStaticMarkup(React.createElement(PortfolioKpis,{portfolio}));
 assert.match(html,/Stem Labs/);assert.match(html,/Partial evidence/);assert.match(html,/total unavailable/);
 assert.doesNotMatch(html,/\$0/);assert.equal((html.match(/Verified input/g)||[]).length,1);
});
test("restricted and foreign organization reads reject before persistence",async()=>{
 let reads=0;const persistence={request:async()=>{reads++;return [];},count:async()=>{reads++;return 0;}};
 await assert.rejects(readMissionControlPortfolio({...session,effectivePermissions:[]},30,persistence));
 await assert.rejects(readMissionControlPortfolio({...session,availableOrganizations:[]},30,persistence));assert.equal(reads,0);
});
test("actual cards preserve certified zero and nonzero",async()=>{
 const p=await readMissionControlPortfolio(session,30,{request:async()=>[],count:async()=>0});assert.ok(p);
 p.metrics.refunds=qualifyFinancialMetric([],"complete","refund");p.metrics.chargebacks=qualifyFinancialMetric([{amount:12,currency:"USD"}],"complete","chargeback");
 const html=renderToStaticMarkup(React.createElement(PortfolioKpis,{portfolio:p}));assert.match(html,/\$0/);assert.match(html,/\$12/);
});
