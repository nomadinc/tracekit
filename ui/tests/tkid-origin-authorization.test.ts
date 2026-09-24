import test from "node:test";
import assert from "node:assert/strict";
import { canManageTkidOrigins, requireTkidOriginManagement } from "../lib/tkid/origin-authorization";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(input:{organizationId?:string;role?:"organization-admin"|"organization-owner"|"platform-admin";resourceType?:string;businessContext?:string|null;overrideOrganizationId?:string;resourceId?:string|null}={}):TraceKitSessionContext {
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
    permissionOverrides:input.resourceType?[{id:"override-review",membershipId:"membership-review",capability:"admin.manage_feature_access",effect:"allow",organizationId:input.overrideOrganizationId??organizationId,resourceType:input.resourceType,resourceId:input.resourceId===undefined?null:input.resourceId}]:[],
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

test("organization-owner requires the scoped TKID override",()=>{
  const without=session({role:"organization-owner"});
  without.effectivePermissions=without.effectivePermissions.filter((permission)=>permission!=="admin.manage_feature_access");
  assert.equal(canManageTkidOrigins(without),false);
  assert.throws(()=>requireTkidOriginManagement(without),/unavailable/);
  assert.equal(canManageTkidOrigins(session({role:"organization-owner",resourceType:"tkid_origin_registry"})),true);
});

test("registry-wide authorization requires a null resource ID",()=>{
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",resourceId:null})),true);
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",resourceId:"origin-arbitrary"})),false);
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",resourceId:"origin-wrong"})),false);
  const unnormalized=session({resourceType:"tkid_origin_registry"});
  unnormalized.permissionOverrides[0].resourceId=undefined as unknown as null;
  assert.equal(canManageTkidOrigins(unnormalized),false);
});

test("missing Bullseye Business Context and wrong-scope overrides remain denied",()=>{
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",businessContext:null})),false);
  const cross=session({resourceType:"tkid_origin_registry"});
  cross.permissionOverrides[0].organizationId="org-other";
  assert.equal(canManageTkidOrigins(cross),false);
  assert.equal(canManageTkidOrigins(session({resourceType:"other_registry"})),false);
  assert.equal(canManageTkidOrigins(session({resourceType:"tkid_origin_registry",overrideOrganizationId:"org-other"})),false);
});

test("platform-admin behavior remains available without a scoped override",()=>{
  assert.equal(canManageTkidOrigins(session({role:"platform-admin"})),true);
});

test("authorization fails closed when organization, context, or capabilities are missing",()=>{
  const noOrganization=session({resourceType:"tkid_origin_registry"}); noOrganization.activeOrganization=null;
  assert.equal(canManageTkidOrigins(noOrganization),false);
  const noConnector=session({resourceType:"tkid_origin_registry"}); noConnector.effectivePermissions=noConnector.effectivePermissions.filter((permission)=>permission!=="connectors.manage");
  assert.equal(canManageTkidOrigins(noConnector),false);
  assert.throws(()=>requireTkidOriginManagement(noConnector),/unavailable/);
});
