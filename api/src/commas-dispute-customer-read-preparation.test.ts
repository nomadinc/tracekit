import test from 'node:test';import assert from 'node:assert/strict';
import {preparedCustomerDisputes as read,preparedSourceExposure as exposure} from './commas-dispute-customer-read-preparation.ts';
const scope={organizationId:'org',connectionId:'connection',providerAccountId:'account'};
const order={...scope,canonicalOrderId:'order',resolvedPersonId:'person',journeyId:null,tkid:null};
const dispute={...scope,id:'dispute',providerDisputeId:'provider-dispute',canonicalOrderId:'order',reconciliationState:'matched',identityAuditVerified:true,status:'lost',principal:'49.00',principalCurrency:'USD',principalCurrencySource:null,fee:'15.00',feeCurrency:'EUR',feeCurrencySource:'provider_payload.fee_currency',evidenceId:'evidence',observedAt:null};
test('order linked to person without TKID still exposes dispute with unknown journey',()=>{
 const row=read(scope,'person',[order],[dispute])[0];
 assert.equal(row.journeyId,null);assert.equal(row.trackingIdentityAvailable,false);
 assert.equal(row.principal.currency,null);assert.equal(row.fee.currency,'EUR');assert.equal(row.walletLoss,null);
 assert.equal(row.matchAuthority,'exact_provider_identity');
});
test('existing journey is preserved without manufacturing identifiers',()=>{
 const row=read(scope,'person',[{...order,journeyId:'journey',tkid:'tkid'}],[dispute])[0];
 assert.equal(row.journeyId,'journey');assert.equal(row.trackingIdentityAvailable,true);
 assert.equal('tkid' in row,false);
});
test('unresolved suggested or other person relationships are not attached',()=>{
 assert.deepEqual(read(scope,'person',[order],[{...dispute,reconciliationState:'review'}]),[]);
 assert.deepEqual(read(scope,'person',[order],[{...dispute,identityAuditVerified:false}]),[]);
 assert.deepEqual(read(scope,'other',[order],[dispute]),[]);
 assert.deepEqual(read(scope,'person',[{...order,resolvedPersonId:null}],[dispute]),[]);
});
test('customer read enforces every tenant scope dimension',()=>{
 for(const key of ['organizationId','connectionId','providerAccountId'] as const){
  assert.throws(()=>read(scope,'person',[{...order,[key]:'other'}],[dispute]),/scope_conflict/);
  assert.throws(()=>read(scope,'person',[order],[{...dispute,[key]:'other'}]),/scope_conflict/);
 }
});
test('duplicate projections and ambiguous order rows hold',()=>{
 assert.throws(()=>read(scope,'person',[order,order],[dispute]),/ambiguous/);
 assert.throws(()=>read(scope,'person',[order],[dispute,dispute]),/duplicate/);
});
const row={disputeId:'d',source:'source',principal:'0.10',currency:'USD',currencySource:'provider_payload.currency',exactOrderMatch:true};
test('source principal amounts stay partitioned by independently backed currency',()=>{
 const groups=exposure([row,{...row,disputeId:'d2',principal:'0.20'},{...row,disputeId:'d3',principal:'99',currency:'EUR'},{...row,disputeId:'d4',currencySource:null}]);
 assert.deepEqual(groups.map(g=>[g.currency,g.principalAmount]),[['USD','0.30'],['EUR','99'],[null,null]]);
 assert.equal(groups[2].unknownAmountCount,1);assert.ok(groups.every(g=>g.walletLoss===null));
});
test('missing source and invalid amount remain visible without guessing or rounding',()=>{
 const g=exposure([{...row,source:null,principal:null}])[0];
 assert.equal(g.source,null);assert.equal(g.unknownAmountCount,1);assert.equal(g.principalAmount,null);
});
test('source decimal precision is preserved without assuming two decimal currencies',()=>{
 assert.equal(exposure([{...row,currency:'KWD',principal:'1.234'},{...row,disputeId:'d2',currency:'KWD',principal:'0.001'}])[0].principalAmount,'1.235');
 assert.equal(exposure([{...row,currency:'JPY',principal:'100'}])[0].principalAmount,'100');
 const partial=exposure([row,{...row,disputeId:'d2',principal:null}])[0];
 assert.equal(partial.principalAmount,null);assert.equal(partial.knownPrincipalAmount,'0.10');
});
test('heuristic attribution and repeated disputes cannot inflate source exposure',()=>{
 assert.throws(()=>exposure([{...row,exactOrderMatch:false}]),/exact_order_match_required/);
 assert.throws(()=>exposure([row,row]),/duplicate/);
});
test('unrecognized or principal-only provenance never qualifies fee currency',()=>{
 const row=read(scope,'person',[order],[{...dispute,principalCurrencySource:'account.currency',feeCurrencySource:'provider_payload.currency'}])[0];
 assert.equal(row.principal.currency,null);assert.equal(row.fee.currency,null);
});
