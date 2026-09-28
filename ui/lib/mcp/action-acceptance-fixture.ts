import{buildGovernedActionPlans,buildRecommendations,buildTrackingInvestigation,type JourneyIntelligence}from"./journey-repository";
export function buildM12SyntheticAcceptanceFixture(serverProofFlag:string|undefined){
 if(serverProofFlag!=="m12-inspect-evidence-v1")throw new Error("synthetic_acceptance_fixture_unavailable");
 const x:JourneyIntelligence={customerId:"synthetic-m12-customer",journeyId:"synthetic-m12-journey",chronology:[
  {eventId:"synthetic-click",eventType:"click",occurredAt:"2026-09-28T02:00:00Z",sourcePlatform:"everflow",role:"marketing_touchpoint",observed:true,identifiers:[{type:"Affiliate ID",value:"synthetic-affiliate"}],relationships:[],provenance:{sourceConnector:"synthetic_acceptance_fixture",sourceRecordId:"synthetic-click"}},
  {eventId:"synthetic-purchase",eventType:"purchase",occurredAt:"2026-09-28T02:01:00Z",sourcePlatform:"commas",role:"commerce_event",observed:true,identifiers:[{type:"Offer ID",value:"synthetic-offer"}],relationships:[],provenance:{sourceConnector:"synthetic_acceptance_fixture",sourceRecordId:"synthetic-purchase"}}
 ],attribution:{status:"attributed",affiliateId:"synthetic-affiliate",offerId:"synthetic-offer",source:"synthetic",primaryEvidenceEventIds:["synthetic-click"],corroboratingEventIds:[],supportingEventIds:["synthetic-click"]},relationships:[{type:"customer_journey",fromId:"synthetic-m12-customer",toId:"synthetic-m12-journey",evidenceEventIds:["synthetic-click","synthetic-purchase"]},{type:"journey_order",fromId:"synthetic-m12-journey",toId:"synthetic-order",evidenceEventIds:["synthetic-purchase"]}],evidenceGroups:[],conclusions:[
  {type:"attribution_established",status:"established",summary:"Synthetic attribution evidence is retained.",evidenceEventIds:["synthetic-click"],relationshipTypes:[],evidenceGroupIndexes:[]},
  {type:"commerce_linked",status:"established",summary:"Synthetic commerce evidence is linked.",evidenceEventIds:["synthetic-purchase"],relationshipTypes:["journey_order"],evidenceGroupIndexes:[]},
  {type:"deterministic_identity_bridge",status:"unresolved",summary:"Synthetic fixture intentionally omits a shared deterministic identifier.",evidenceEventIds:["synthetic-click","synthetic-purchase"],relationshipTypes:[],evidenceGroupIndexes:[]}
 ],commerce:[{orderId:"synthetic-order",amount:1,status:"synthetic",createdAt:"2026-09-28T02:01:00Z"}],evidenceLimits:[]};
 return buildGovernedActionPlans(buildRecommendations(buildTrackingInvestigation(x)));
}
