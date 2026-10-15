import test from 'node:test';import assert from 'node:assert/strict';
import {buildPreparedSourceDisputeReport as report,type SourceReportOrder,type SourceReportDispute} from './commas-source-dispute-report.ts';
const scope={organizationId:'org',connectionId:'connection',providerAccountId:'account'};
const attribution={source:{value:'s',evidenceId:'e',authority:'observed' as const},sub1:{value:'a',evidenceId:'e',authority:'exact' as const},sub2:{value:'b',evidenceId:'e',authority:'exact' as const}};
const order:SourceReportOrder={...scope,id:'o',orderedAt:'2026-10-10',attribution};
const dispute:SourceReportDispute={...scope,id:'d',orderId:'o',identityAuditVerified:true,principal:'49',currency:'USD',currencySource:'provider_payload.currency',fee:'15',feeCurrency:'EUR',feeCurrencySource:'provider_payload.fee_currency'};
const coverage={from:'2026-10-01',to:'2026-10-12',ordersComplete:true,disputesComplete:true,observedThrough:'2026-10-14'};
test('source and every sub dimension are independent with distinct fee currencies',()=>{
 const r=report(scope,[order],[dispute],coverage);
 assert.equal(r.dimensions.length,7);
 assert.equal(r.dimensions.find(d=>d.dimension==='sub2')!.groups[0].value,'b');
 const g=r.dimensions.find(d=>d.dimension==='source')!.groups[0];
 assert.equal(g.principalByCurrency[0].currency,'USD');assert.equal(g.feesByCurrency[0].currency,'EUR');assert.equal(g.walletLoss,null);
});
test('multiple dispute events affect one order once in the rate denominator',()=>{
 const g=report(scope,[order,{...order,id:'o2'}],[dispute,{...dispute,id:'d2'}],coverage).dimensions[0].groups[0];
 assert.equal(g.disputeEvents,2);assert.equal(g.affectedOrders,1);assert.equal(g.orderDisputeRate,0.5);
});
test('incomplete coverage suppresses rates and preserves unresolved diagnostics',()=>{
 const r=report(scope,[order],[dispute,{...dispute,id:'unknown',identityAuditVerified:false}],{...coverage,ordersComplete:false});
 assert.equal(r.coverage.unresolvedDisputes,1);assert.equal(r.dimensions[0].groups[0].orderDisputeRate,null);
});
test('unknown attribution remains explicit and out-of-cohort orders are excluded',()=>{
 const r=report(scope,[{...order,attribution:{}},{...order,id:'old',orderedAt:'2026-09-01'}],[dispute,{...dispute,id:'old-d',orderId:'old'}],coverage);
 assert.equal(r.dimensions[0].groups[0].value,null);assert.equal(r.coverage.outsideCohortDisputes,1);
});
test('all tenant dimensions reject foreign rows',()=>{
 for(const key of ['organizationId','connectionId','providerAccountId'] as const){
  assert.throws(()=>report(scope,[{...order,[key]:'other'}],[dispute],coverage),/scope_conflict/);
  assert.throws(()=>report(scope,[order],[{...dispute,[key]:'other'}],coverage),/scope_conflict/);
 }
});
test('duplicates and missing fee provenance cannot inflate or redenominate totals',()=>{
 assert.throws(()=>report(scope,[order,order],[dispute],coverage),/duplicate/);
 assert.throws(()=>report(scope,[order],[dispute,dispute],coverage),/duplicate/);
 const g=report(scope,[order],[{...dispute,feeCurrencySource:null}],coverage).dimensions[0].groups[0];
 assert.equal(g.feesByCurrency[0].currency,null);assert.equal(g.feesByCurrency[0].amount,null);
});
test('unresolved identity suppresses rates even when transport scans are complete',()=>{
 const r=report(scope,[order],[dispute,{...dispute,id:'unknown',orderId:'absent'}],coverage);
 assert.equal(r.coverage.complete,false);assert.equal(r.coverage.unresolvedDisputes,1);
 assert.equal(r.dimensions[0].groups[0].orderDisputeRate,null);
});
