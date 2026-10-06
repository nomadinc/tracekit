import assert from "node:assert/strict";
import { listGovernedActionNotifications, updateGovernedActionNotificationState } from "../lib/mcp/action-notifications";

const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw new Error("local Supabase environment is required");
const org="8f6bb14b-2126-49b8-bfdb-c60edbc3549b",actor="40000000-0000-4000-8000-000000000002";
const ids={awaiting:"a1000000-0000-4000-8000-000000000001",confirmed:"a1000000-0000-4000-8000-000000000002",expired:"a1000000-0000-4000-8000-000000000003",disabled:"a1000000-0000-4000-8000-000000000004",failure:"a1000000-0000-4000-8000-000000000005",recovery:"a1000000-0000-4000-8000-000000000006",success:"a1000000-0000-4000-8000-000000000007",rollback:"a1000000-0000-4000-8000-000000000008"};
const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
async function api(path:string,method="GET",body?:unknown){const response=await fetch(`${base}/rest/v1/${path}`,{method,headers:{...headers,...(method==="GET"?{}:{Prefer:"return=representation"})},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);return response.status===204?null:response.json();}
const future="2099-01-02T00:00:00Z",past="2020-01-02T00:00:00Z",issued="2026-10-06T12:00:00Z";
const shopifyTarget={shopDomain:"fixture.myshopify.com",callbackUrl:"https://example.invalid/callback",topic:"APP_UNINSTALLED"};
const intent=(intentId:string,operation:string,expires_at=future)=>({intent_id:intentId,organization_id:org,actor_user_id:actor,plan_identity:`plan:${intentId}`,operation,plan:{proposal:"immutable",target:shopifyTarget},audit_correlation_id:`corr:${intentId}`,issued_at:expires_at===past?"2020-01-01T00:00:00Z":issued,expires_at,target_kind:operation.startsWith("shopify")?"shopify_webhook_subscription":"commas_webhook_subscription",target:shopifyTarget});
const guardedTables=["work_items","work_item_activity","mcp_external_action_audit","mcp_external_mutation_audit"];
async function counts(){return Object.fromEntries(await Promise.all(guardedTables.map(async table=>[table,Number((await api(`${table}?select=*`,"GET"))?.length||0)])));}

async function main(){
await api("mcp_action_intents","POST",[
 intent(ids.awaiting,"shopify.controlled_webhook_create_delete_proof"),intent(ids.confirmed,"shopify.controlled_webhook_create_delete_proof"),intent(ids.expired,"shopify.controlled_webhook_create_delete_proof",past),
 intent(ids.disabled,"commas.webhook_test_delivery"),intent(ids.failure,"shopify.controlled_webhook_create_delete_proof"),intent(ids.recovery,"shopify.controlled_webhook_create_delete_proof"),intent(ids.success,"shopify.controlled_webhook_create_delete_proof"),intent(ids.rollback,"shopify.controlled_webhook_create_delete_proof")
]);
await api("mcp_action_confirmations","POST",[ids.confirmed,ids.failure,ids.recovery,ids.success,ids.rollback].map((intent_id,i)=>({confirmation_id:`a2000000-0000-4000-8000-00000000000${i+1}`,intent_id,organization_id:org,actor_user_id:actor,confirmed_at:issued,expires_at:future})));
const auth=(intentId:string,n:number)=>({authorization_id:`a3000000-0000-4000-8000-00000000000${n}`,organization_id:org,envelope_identity:`envelope:${intentId}`,idempotency_key:`idem:${intentId}`,audit_correlation_id:`corr:${intentId}`,state:"consumed",expires_at:future,consumed_at:issued,consumption_id:`a4000000-0000-4000-8000-00000000000${n}`,created_at:issued,envelope_created_at:issued});
await api("mcp_action_authorizations","POST",[auth(ids.failure,1),auth(ids.success,2)]);
await api("mcp_action_execution_results","POST",[
 {id:"a5000000-0000-4000-8000-000000000001",organization_id:org,envelope_identity:`envelope:${ids.failure}`,idempotency_key:`idem:${ids.failure}`,audit_correlation_id:`corr:${ids.failure}`,consumption_id:"a4000000-0000-4000-8000-000000000001",result:{status:"failed",reason:"provider_rejected",provider:"shopify",operation:"shopify.controlled_webhook_create_delete_proof"},created_at:issued},
 {id:"a5000000-0000-4000-8000-000000000002",organization_id:org,envelope_identity:`envelope:${ids.success}`,idempotency_key:`idem:${ids.success}`,audit_correlation_id:`corr:${ids.success}`,consumption_id:"a4000000-0000-4000-8000-000000000002",result:{status:"completed",provider:"shopify",operation:"shopify.controlled_webhook_create_delete_proof"},created_at:issued}
]);
await api("mcp_shopify_mutation_recovery","POST",[
 {recovery_id:"a6000000-0000-4000-8000-000000000001",organization_id:org,intent_id:ids.recovery,plan_identity:`plan:${ids.recovery}`,shop_domain:"fixture.myshopify.com",callback_url:"https://example.invalid/callback",topic:"APP_UNINSTALLED",state:"created",created_external_id:"gid://fixture/1",created_verified:true,rollback_verified:false,audit_correlation_id:`corr:${ids.recovery}`,created_at:issued,updated_at:issued},
 {recovery_id:"a6000000-0000-4000-8000-000000000002",organization_id:org,intent_id:ids.rollback,plan_identity:`plan:${ids.rollback}`,shop_domain:"fixture.myshopify.com",callback_url:"https://example.invalid/callback",topic:"APP_UNINSTALLED",state:"rollback_verified",created_external_id:"gid://fixture/2",created_verified:true,rollback_verified:true,audit_correlation_id:`corr:${ids.rollback}`,created_at:issued,updated_at:issued}
]);

const before=await counts();
const first=await listGovernedActionNotifications(org),second=await listGovernedActionNotifications(org);
assert.deepEqual(second,first,"repeated evaluation must be deterministic");
assert.equal(first.length,3);assert.deepEqual(first.map(x=>x.metadata.action_notification_kind).sort(),["awaiting_approval","execution_failure","verification_failure"]);
const awaiting=first.find(x=>x.metadata.intent_id===ids.awaiting)!;assert.equal(awaiting.metadata.priority,"high");assert.equal(awaiting.id,`action_notification:awaiting_approval:${ids.awaiting}`);assert.match(awaiting.deep_link!,new RegExp(ids.awaiting));assert.equal(awaiting.evidence.plan_identity,`plan:${ids.awaiting}`);
assert.ok(!first.some(x=>[ids.confirmed,ids.expired,ids.disabled,ids.success,ids.rollback].includes(String(x.metadata.intent_id))));
const failure=first.find(x=>x.metadata.action_notification_kind==="execution_failure")!;assert.equal(failure.metadata.priority,"urgent");assert.equal(failure.id,"action_notification:execution_failure:a5000000-0000-4000-8000-000000000001");assert.match(failure.deep_link!,new RegExp(ids.failure));
const recovery=first.find(x=>x.metadata.action_notification_kind==="verification_failure")!;assert.equal(recovery.metadata.priority,"urgent");assert.match(recovery.deep_link!,new RegExp(ids.recovery));
assert.equal((await api(`mcp_action_notification_states?organization_id=eq.${org}&select=*`)).length,0,"GET/evaluation wrote presentation state");
const lifecycleBefore=await api(`mcp_action_intents?organization_id=eq.${org}&select=intent_id,plan,expires_at`);
await updateGovernedActionNotificationState(org,awaiting.id,"read");await updateGovernedActionNotificationState(org,awaiting.id,"read");
await updateGovernedActionNotificationState(org,awaiting.id,"dismiss");await updateGovernedActionNotificationState(org,awaiting.id,"dismiss");
assert.equal((await api(`mcp_action_notification_states?organization_id=eq.${org}&notification_id=eq.${encodeURIComponent(awaiting.id)}&select=*`)).length,1);
assert.deepEqual(await api(`mcp_action_intents?organization_id=eq.${org}&select=intent_id,plan,expires_at`),lifecycleBefore,"presentation mutated lifecycle");
await api(`mcp_shopify_mutation_recovery?recovery_id=eq.a6000000-0000-4000-8000-000000000001`,"PATCH",{state:"rollback_verified",rollback_verified:true,updated_at:"2026-10-06T13:00:00Z"});
assert.ok(!(await listGovernedActionNotifications(org)).some(x=>x.metadata.intent_id===ids.recovery),"resolved recovery remained active");
await api("mcp_action_confirmations","POST",{confirmation_id:"a2000000-0000-4000-8000-000000000009",intent_id:ids.awaiting,organization_id:org,actor_user_id:actor,confirmed_at:issued,expires_at:future});
assert.ok(!(await listGovernedActionNotifications(org)).some(x=>x.metadata.intent_id===ids.awaiting),"confirmed awaiting notification remained active");
assert.deepEqual(await counts(),before,"evaluation produced a governed side effect");
const storedFailure=(await api("mcp_action_execution_results?id=eq.a5000000-0000-4000-8000-000000000001&select=*"))[0];
assert.deepEqual(Object.keys(storedFailure.result).sort(),["operation","provider","reason","status"]);assert.ok(!JSON.stringify(storedFailure).match(/credential|access.?token|raw.?provider/i));
console.log("PASS: M4.4 real-database governed notification fixtures, suppression, presentation state, recovery resolution, and zero-side-effect evaluation");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
