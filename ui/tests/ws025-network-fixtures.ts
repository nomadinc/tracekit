import type { AuthoritativeSnapshot, AuthoritativeProvider } from "../lib/network-intelligence/read-authorization";
import type { ContextDTO,NetworkDTOs } from "../lib/network-intelligence/dtos";
import { FRESHNESS,sampling,SIGNALS,STAGES,STATUS,type Registries } from "../lib/network-intelligence/contracts";
import { projectSnapshot } from "../lib/network-intelligence/safe-projection";
export const BINDING_EPOCH="12345678-1234-4234-8234-123456789abc";
export const AT="2026-10-16T12:00:00.000Z";
export const registries:Registries={versions:["test-v1"],countries:["US"],catalogs:{networkType:{residential:"RESIDENTIAL"},organization:{"Example Network":"EXAMPLE_NETWORK"},carrier:{"Example Carrier":"EXAMPLE_CARRIER"},region:{"Example Region":"EXAMPLE_REGION"}}};
export function source(){return {
  schemaVersion:"1.0",semanticsVersion:"test-v1",derivationRuleVersion:"test-v1",observationId:"obs_synthetic_00000001",tenantRef:"tenant_synthetic_00000001",sessionRef:"session_synthetic_00000001",eventRef:"event_synthetic_00000001",revision:1,observedAt:AT,updatedAt:AT,status:"COMPLETE",completedStages:["OWNED"],pendingStages:[],
  intelligence:{network:{proxy:{state:"FALSE",freshness:"CURRENT",evidenceRefs:["evidence_proxy"],confidence:{value:0,basis:"SOURCE_REPORTED"}},asn:{state:"KNOWN",value:64512,freshness:"CURRENT",evidenceRefs:["evidence_asn"]}}},
  evidence:[{id:"evidence_proxy",domain:"NETWORK",field:"proxy",provider:"tracekit",sourceClass:"OWNED_OBSERVATION",value:false,observedAt:AT,freshness:"CURRENT"},{id:"evidence_asn",domain:"NETWORK",field:"asn",provider:"tracekit",sourceClass:"OWNED_OBSERVATION",value:64512,observedAt:AT,freshness:"CURRENT"}],conflicts:[],errors:[],explanations:[],
};}
export function auth():AuthoritativeSnapshot {return {
  identity:{kind:"persistent",userId:"user_a",status:"active",sessionId:"session_a"},account:{id:"account_a",status:"active"},organization:{id:"org_a",status:"active"},membership:{id:"member_a",userId:"user_a",organizationId:"org_a",accountId:"account_a",status:"active",validFrom:"2026-10-01T00:00:00.000Z",expiresAt:"2026-11-01T00:00:00.000Z"},decisions:[{capability:"network_intelligence.view",effect:"allow",scope:{kind:"ORGANIZATION",organizationId:"org_a"}}],entitlement:{id:"entitlement_a",subjectUserId:"user_a",membershipId:"member_a",organizationId:"org_a",permission:"network_intelligence.view",scopeKind:"ORGANIZATION",workspaceId:null,revokedAt:null,approvedTenantSetVersion:"tenants_v1",status:"active",validFrom:"2026-10-01T00:00:00.000Z",expiresAt:"2026-10-31T00:00:00.000Z"},tenantSet:{version:"tenants_v1",organizationId:"org_a",completeOrganizationCoverage:true,tenants:[{tenantRef:"tenant_synthetic_00000001",organizationId:"org_a",status:"active",bindingEpoch:BINDING_EPOCH}]},versions:{identity:"v1",account:"v1",organization:"v1",membership:"v1",permissions:"v1",entitlement:"v1",tenantBindings:"v1",workspaceMappings:"disabled_v1"},adminClientView:false,
};}
export function dtos():NetworkDTOs {
  const snapshot=projectSnapshot(source(),{receivedAt:AT,previousRevisionReceived:false},registries);
  const scope={kind:"ORGANIZATION",workspaceId:null} as const;
  const context:ContextDTO={generatedAt:AT,snapshotAt:AT,scope,from:"2026-10-16T00:00:00.000Z",toExclusive:"2026-10-17T00:00:00.000Z",timeBasis:"OBSERVED_AT",countBasis:"DISTINCT_OBSERVATIONS_CURRENT_RECEIVED_REVISION",sampling:sampling()};
  const statuses=Object.fromEntries(STATUS.map(s=>[s,s==="COMPLETE"?1:0])) as NetworkDTOs["overview"]["statusCounts"];
  const stages=Object.fromEntries(STAGES.map(s=>[s,0])) as NetworkDTOs["diagnostics"]["pendingStageCounts"];
  const page={limit:100,nextCursor:null,hasMore:false};
  return {
    overview:{context,observationCount:1,timeline:[{from:context.from,toExclusive:context.toExclusive,observations:1}],networkTypes:[{kind:"UNKNOWN",value:null,observations:1}],countries:[{kind:"UNKNOWN",value:null,observations:1}],regions:[{kind:"UNKNOWN",value:null,observations:1}],signals:Object.fromEntries(SIGNALS.map(s=>[s,{trueCount:0,falseCount:s==="proxy"?1:0,unknownCount:s==="proxy"?0:1,conflictingCount:0,denominatorObservations:1}])) as NetworkDTOs["overview"]["signals"],providerCoverage:[{provider:"TRACEKIT",observationsWithEvidence:1,denominatorObservations:1}],statusCounts:statuses},
    list:{context,observations:[snapshot.summary],page},
    detail:{scope,generatedAt:AT,snapshotAt:AT,current:snapshot,revisionHistory:{receivedRevisions:[1],page},sampling:sampling()},
    revision:{scope,generatedAt:AT,snapshotAt:AT,snapshot,sampling:sampling()},
    diagnostics:{context,denominatorObservations:1,statusCounts:statuses,completedStageCounts:{...stages,OWNED:1},pendingStageCounts:stages,reportedErrors:[],providerCoverage:[{provider:"TRACEKIT",observationsWithEvidence:1,denominatorObservations:1}],evidenceFreshness:{denominatorEvidenceItems:2,counts:Object.fromEntries(FRESHNESS.map(f=>[f,f==="CURRENT"?2:0])) as NetworkDTOs["diagnostics"]["evidenceFreshness"]["counts"]},latestReceivedAt:AT},
  };
}

/** Synthetic authority independent of the snapshot being verified. */
export function testProvider(load:AuthoritativeProvider["load"]=async()=>auth()):AuthoritativeProvider {
  const current=auth();
  return {load,verifyBindingEpochs:async snapshot=>
    snapshot.organization.id===current.organization.id&&
    snapshot.tenantSet.version===current.tenantSet.version&&
    snapshot.versions.tenantBindings===current.versions.tenantBindings&&
    snapshot.tenantSet.tenants.length===current.tenantSet.tenants.length&&
    snapshot.tenantSet.tenants.every(t=>current.tenantSet.tenants.some(binding=>
      binding.status==="active"&&binding.organizationId===t.organizationId&&
      binding.tenantRef===t.tenantRef&&binding.bindingEpoch===t.bindingEpoch))};
}
