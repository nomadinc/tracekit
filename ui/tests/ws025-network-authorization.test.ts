import assert from "node:assert/strict";
import test from "node:test";
import { withAuthorizedNetworkRead,NetworkAuthorizationDenied,type AuthoritativeSnapshot } from "../lib/network-intelligence/read-authorization";
import { ROLE_PERMISSIONS } from "../lib/identity/permissions";
import { NetworkDataUnavailable } from "../lib/network-intelligence/contracts";
import { AT,auth,BINDING_EPOCH,testProvider } from "./ws025-network-fixtures";

async function denied(edit:(s:AuthoritativeSnapshot)=>void,params=new URLSearchParams(),verifyMustNotRun=false){
  const s=auth();edit(s);let calls=0;let verifications=0;
  const provider=testProvider(async()=>s);const checkedProvider={...provider,verifyBindingEpochs:async(snapshot:AuthoritativeSnapshot)=>{verifications++;return provider.verifyBindingEpochs(snapshot);}};
  await assert.rejects(withAuthorizedNetworkRead(params,async()=>{calls++;return "foreign-data";},checkedProvider,()=>Date.parse(AT)),e=>e instanceof NetworkAuthorizationDenied&&e.status===404&&e.code==="RESOURCE_UNAVAILABLE"&&e.message==="The requested resource is unavailable.");
  assert.equal(calls,0);if(verifyMustNotRun)assert.equal(verifications,0);
}
test("default unavailable authoritative provider denies before read",async()=>{
  let calls=0;await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{calls++;}),NetworkAuthorizationDenied);assert.equal(calls,0);
});
const cases:Array<[string,(s:AuthoritativeSnapshot)=>void]>=[
  ["missing dedicated permission",s=>{s.decisions=[];}],
  ["customers.view is insufficient",s=>{s.decisions[0].capability="customers.view";}],
  ["missing entitlement",s=>{delete (s as Partial<AuthoritativeSnapshot>).entitlement;}],
  ["expired entitlement",s=>{s.entitlement.expiresAt=AT;}],
  ["revoked entitlement",s=>{s.entitlement.revokedAt=AT;}],
  ["inactive membership",s=>{s.membership.status="inactive";}],
  ["expired membership",s=>{s.membership.expiresAt=AT;}],
  ["future membership",s=>{s.membership.validFrom="2027-01-01T00:00:00.000Z";}],
  ["inactive user",s=>{s.identity.status="inactive";}],
  ["inactive account",s=>{s.account.status="inactive";}],
  ["deactivated organization",s=>{s.organization.status="inactive";}],
  ["wrong subject",s=>{s.entitlement.subjectUserId="foreign";}],
  ["wrong membership",s=>{s.entitlement.membershipId="foreign";}],
  ["foreign organization",s=>{s.entitlement.organizationId="foreign";}],
  ["foreign membership organization",s=>{s.membership.organizationId="foreign";}],
  ["foreign tenant ownership",s=>{s.tenantSet.tenants[0].organizationId="foreign";}],
  ["inactive tenant",s=>{s.tenantSet.tenants[0].status="inactive";}],
  ["missing tenant version",s=>{s.tenantSet.version="";}],
  ["stale tenant version",s=>{s.tenantSet.version="v2";}],
  ["incomplete organization coverage",s=>{s.tenantSet.completeOrganizationCoverage=false;}],
  ["explicit deny",s=>{s.decisions.push({...s.decisions[0],effect:"deny"});}],
  ["narrow deny blocks organization totals",s=>{s.decisions.push({capability:"network_intelligence.view",effect:"deny",scope:{kind:"WORKSPACE",organizationId:"org_a",workspaceId:"workspace_a",ownershipVerified:true}});}],
  ["resource-only grant is insufficient",s=>{s.decisions=[{capability:"network_intelligence.view",effect:"allow",scope:{kind:"OBSERVATION",organizationId:"org_a",observationId:"obs_synthetic_00000001",ownershipVerified:true}}];}],
  ["Admin Client View without entitlement",s=>{s.adminClientView=true;delete (s as Partial<AuthoritativeSnapshot>).entitlement;}],
];
for(const [name,edit] of cases)test(name,()=>denied(edit));
for(const query of ["organization_id=foreign","workspaceId=foreign","tenantRef=tenant_foreign_0001","tenant_id=tenant_foreign_0001","organization_id=org_a&organization_id=foreign","organization_id=org_a&organization_id=org_a","organization_id=org_a&workspace_id=foreign"]){test("reject forged/conflicting hints: "+query,()=>denied(()=>{},new URLSearchParams(query)));}
test("irrelevant foreign deny does not grant or deny local scope",async()=>{
  const s=auth();s.decisions.push({capability:"network_intelligence.view",effect:"deny",scope:{kind:"ORGANIZATION",organizationId:"foreign"}});
  const result=await withAuthorizedNetworkRead(new URLSearchParams(),async scope=>scope,testProvider(async()=>s),()=>Date.parse(AT));assert.equal(result.organizationId,"org_a");assert.deepEqual(result.tenantRefs,["tenant_synthetic_00000001"]);
});
for(const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>){test("no automatic network grant: "+role,async()=>{
  assert.equal((ROLE_PERMISSIONS[role] as readonly string[]).includes("network_intelligence.view"),false);
  await denied(s=>{s.decisions=(ROLE_PERMISSIONS[role] as readonly string[]).map(capability=>({capability,effect:"allow",scope:{kind:"ORGANIZATION",organizationId:"org_a"}}));});
});}
test("provider errors fail closed without leaking details",async()=>{
  await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>null,testProvider(async()=>{throw new Error("synthetic-private-provider-error");})),e=>e instanceof NetworkAuthorizationDenied&&!e.message.includes("synthetic"));
});
for(const [name,edit] of [
  ["revocation",(s:AuthoritativeSnapshot)=>{s.entitlement.revokedAt=AT;}],
  ["binding epoch change",(s:AuthoritativeSnapshot)=>{s.tenantSet.tenants[0].bindingEpoch="12345678-1234-4234-8234-123456789abd";}],
  ["permission version change",(s:AuthoritativeSnapshot)=>{s.versions.permissions="v2";}],
  ["session switch",(s:AuthoritativeSnapshot)=>{s.identity.sessionId="session_b";}],
] as const){test("final revalidation discards response on "+name,async()=>{
  let loads=0;const initial=auth();const changed=auth();edit(changed);let reads=0;
  await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{reads++;return {count:999};},testProvider(async()=>++loads===1?initial:changed),()=>Date.parse(AT)),NetworkAuthorizationDenied);assert.equal(reads,1);assert.equal(loads,2);
});}
test("reader failures cannot expose persistence errors",async()=>{
  await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{throw new Error("synthetic-private-database-error");},testProvider(),()=>Date.parse(AT)),e=>e instanceof NetworkDataUnavailable&&!e.message.includes("synthetic"));
});
test("provider disappearance on final validation discards completed data",async()=>{
  let loads=0;await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>({count:1}),testProvider(async()=>++loads===1?auth():null),()=>Date.parse(AT)),NetworkAuthorizationDenied);
});

for(const key of ["workspaceId","workspace_id"]){
  for(const value of ["org_a","workspace_a","foreign_workspace","","{malformed}"]){
    for(const org of ["","&organization_id=org_a"]){
      test("M2A-SEC-001 rejects supplied workspace selector: "+key+"="+value+org,
        ()=>denied(()=>{},new URLSearchParams(key+"="+encodeURIComponent(value)+org)));
    }
  }
}
const invalidEpochs:unknown[]=[undefined,null,"","not_a_uuid","binding_v1",
  "12345678-1234-4234-8234-123456789ab",BINDING_EPOCH.toUpperCase(),
  "{"+BINDING_EPOCH+"}",BINDING_EPOCH.replaceAll("-","")," "+BINDING_EPOCH,
  "00000000-0000-0000-0000-000000000000",[BINDING_EPOCH],0,false,{},
  "12345678-1234-0234-8234-123456789abc",
  "12345678-1234-6234-8234-123456789abc",
  "12345678-1234-f234-8234-123456789abc",
  "12345678-1234-4234-0234-123456789abc",
  "12345678-1234-4234-7234-123456789abc",
  "12345678-1234-4234-c234-123456789abc",
  BINDING_EPOCH+" ",BINDING_EPOCH+"\n"];
for(const epoch of invalidEpochs){
  test("M2A-SEC-002 denies invalid/noncanonical epoch: "+JSON.stringify(epoch),()=>denied(s=>{
    if(epoch===undefined)delete (s.tenantSet.tenants[0] as Partial<typeof s.tenantSet.tenants[number]>).bindingEpoch;
    else s.tenantSet.tenants[0].bindingEpoch=epoch as string;
  },new URLSearchParams(),true));
}
test("M2A-SEC-002 valid canonical epoch permits scoped read",async()=>{
  let calls=0;await withAuthorizedNetworkRead(new URLSearchParams(),async()=>{calls++;},testProvider(),()=>Date.parse(AT));assert.equal(calls,1);
});
test("M2A-SEC-002 canonical but mismatched epoch denies before read",()=>denied(s=>{s.tenantSet.tenants[0].bindingEpoch="12345678-1234-4234-8234-123456789abd";}));
test("M2A-SEC-002 stale tenant-set epoch denies before read",()=>denied(s=>{s.tenantSet.version="tenants_old";}));
test("M2A-SEC-002 revoked binding denies before read",()=>denied(s=>{s.tenantSet.tenants[0].status="inactive";}));
test("M2A-SEC-002 unavailable authoritative epoch verification denies before read",async()=>{
  let calls=0;await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{calls++;},
    {...testProvider(),verifyBindingEpochs:async()=>{throw new Error("synthetic-private-binding-error");}},()=>Date.parse(AT)),NetworkAuthorizationDenied);assert.equal(calls,0);
});
test("M2A-SEC-002 missing authoritative epoch verifier denies before read",async()=>{
  let calls=0;await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{calls++;},
    {load:async()=>auth()} as unknown as ReturnType<typeof testProvider>,()=>Date.parse(AT)),NetworkAuthorizationDenied);assert.equal(calls,0);
});

for(const query of [
  "workspaceId=org_a", "workspace_id=org_a", "workspaceId=workspace_a",
  "workspaceId=foreign", "workspaceId=", "workspace_id=",
  "organizationId=org_a&workspaceId=org_a",
  "workspaceId=org_a&workspaceId=org_a",
  "workspace_id=&workspace_id=foreign",
  "workspaceId=org_a&workspace_id=org_a",
  "businessContextId=org_a", "businessContextId=",
  "business_context_id=org_a", "business_context_id=",
  "organizationId=org_a&businessContextId=org_a",
])test("NI-READ-001 deny V1 workspace hints before verification/read: "+query,
  ()=>denied(()=>{},new URLSearchParams(query),true));

test("NI-READ-002 changed valid epoch reaches final version comparison and denies",async()=>{
  const initial=auth();const changed=auth();
  changed.tenantSet.tenants[0].bindingEpoch="12345678-1234-4234-8234-123456789abd";
  changed.versions.tenantBindings="v2";
  let loads=0,verifications=0,reads=0;
  // Independent synthetic authority accepts the current epoch at each load.
  const authority=[initial,changed];
  const provider={load:async()=>structuredClone(authority[loads++]),verifyBindingEpochs:async(snapshot:AuthoritativeSnapshot)=>{
    verifications++;const current=authority[loads-1];return snapshot.tenantSet.tenants[0].bindingEpoch===current.tenantSet.tenants[0].bindingEpoch;
  }};
  await assert.rejects(withAuthorizedNetworkRead(new URLSearchParams(),async()=>{reads++;return {count:999};},provider,()=>Date.parse(AT)),
    e=>e instanceof NetworkAuthorizationDenied&&e.message==="The requested resource is unavailable.");
  assert.equal(reads,1);assert.equal(loads,2);assert.equal(verifications,2);
});
