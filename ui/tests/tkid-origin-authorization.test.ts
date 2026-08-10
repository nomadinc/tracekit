import test from "node:test";
import assert from "node:assert/strict";
import { canManageTkidOrigins, requireTkidOriginManagement } from "../lib/tkid/origin-authorization";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(input:{organizationId?:string;role?:"organization-admin"|"platform-admin";resourceType?:string;businessContext?:string|null}={}):TraceKitSessionContext {
  const organizationId=input.organizationId??"org-bullseye",role=input.role??"organization-admin";
  return {
    user:{id:"review-user",workosUserId:"workos-review-user",primaryEmail:"review@example.invalid",displayName:"Review User",avatarUrl:null,status:"active"},
    externalWorkosUserId:"workos-review-user",
    activeAccount:{id:"account-bullseye",accountType:"client",name:"Bullseye Health",status:"active"},
    activeAgency:null,
    activeOrganization:{id:organizationId,accountId:"account-bullseye",name:"Bullseye Health",mark:"BH"},
    availableOrganizations:[{id:organizationId,accountId:"account-bullseye",name:"Bullseye Health",mark:"BH"}],
    membership:{id:"membership-review",userId:"review-user",accountId:null,organizationId,role,status:"active"},
    role,
    effectivePermissions:["connectors.view","connectors.manage","admin.manage_feature_access"],
    permissionOverrides:input.resourceType?[{id:"override-review",membershipId:"membership-review",capability:"admin.manage_feature_access",effect:"allow",organizationId,resourceType:input.resourceType,resourceId:null}]:[],
    accessibleBusinessContexts:[],activeBusinessContextId:input.businessContext===undefined?"offer-bullseye":input.businessContext,
    assurance:{authenticationMethod:"workos",impersonated:false},correlationId:"correlation-review",
  };
}

test("authenticated Bullseye Product/Admin review entitlement grants managed-origin access",()=>{
  const review=session({resourceType:"tkid_origin_registry"});
  assert.equal(canManageTkidOrigins(review),true);
  assert.equal(requireTkidOriginManagement(review),review);
});

test("ordinary Organization Admin and Investigation-only overrides remain denied",()=>{
  assert.equal(canManageTkidOrigins(session()),false);
  assert.equal(canManageTkidOrigins(session({resourceType:"investigation"})),false);
  assert.throws(()=>requireTkidOriginManagement(session()),/unavailable/);
});

test("missing Bullseye Business Context and cross-Organization override remain denied",()=>{
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",businessContext:null})),false);
  const cross=session({resourceType:"tkid_origin_registry"});
  cross.permissionOverrides[0].organizationId="org-other";
  assert.equal(canManageTkidOrigins(cross),false);
});
