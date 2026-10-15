import test from 'node:test';import assert from 'node:assert/strict';
import {readPreparedCustomerDisputes as read} from './commas-customer-dispute-api.ts';
import {getCustomerDetail} from './customer-explorer.ts';
const org='00000000-0000-0000-0000-000000000001',person='00000000-0000-0000-0000-000000000002',id='00000000-0000-0000-0000-000000000003';
test('disabled default never queries new storage',async()=>{
 assert.equal((await read({rpc(){throw new Error('unexpected read')}},{organizationId:org,personId:person})).state,'disabled');
});
test('scoped RPC uses bounded pagination and strips unapproved fields',async()=>{
 const db={async rpc(name:string,args:Record<string,unknown>){assert.equal(name,'read_commas_customer_disputes_prepared');assert.equal(args.p_org,org);assert.equal(args.p_person,person);assert.equal(args.p_limit,50);return {error:null,data:{rows:[{id,canonicalOrderId:id,providerDisputeId:'d',principalAmount:'49.00',principalCurrency:null,feeAmount:'0',feeCurrency:'EUR',status:'won',email:'secret',rawPayload:{secret:'secret'},tkid:'secret',walletLoss:49}],nextCursor:null}};}};
 const result=await read(db,{organizationId:org,personId:person},{enabled:true});
 assert.equal(result.rows[0].principal.currency,null);assert.equal(result.rows[0].fee.currency,'EUR');assert.equal(result.rows[0].walletLoss,null);
 assert.doesNotMatch(JSON.stringify(result),/secret|rawPayload/);
});
test('scope and pagination fail before RPC and read errors are not hidden',async()=>{
 const db={async rpc(){return {error:'failed',data:null}}};
 await assert.rejects(read(db,{organizationId:'wrong',personId:person},{enabled:true}),/scope_invalid/);
 await assert.rejects(read(db,{organizationId:org,personId:person},{enabled:true,limit:1000}),/limit_invalid/);
 await assert.rejects(read(db,{organizationId:org,personId:person},{enabled:true}),/unavailable/);
});
test('customer authorization denial happens before prepared dispute RPC',async()=>{
 let called=false;const q={select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const db={from(){return q},async rpc(){called=true;return {data:null,error:null}}};
 await assert.rejects(getCustomerDetail(db,{workspace_id:org,person_id:person},{enabled:true}),/Customer not found/);
 assert.equal(called,false);
});
