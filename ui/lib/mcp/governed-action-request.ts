import{resolveM12PlanCapability}from"./action-capability-registry";
import{buildExecutionEnvelope,type ExecutionEnvelope,type GovernedActionPlan}from"./journey-repository";

export type GovernedActionRequest={
 organizationId:string;
 plan:GovernedActionPlan;
 planIdentity:string;
 currentPlanIdentity:string;
 confirmation:{confirmationId:string;confirmedAt:string;confirmedPlanIdentity:string;confirmedCustomerId:string;confirmedJourneyId:string|null};
 prerequisitesSatisfied:boolean;
 actionPermissionGranted:boolean;
 requestedAt:string;
 expiresAt:string;
 idempotencyKey:string;
 auditCorrelationId:string;
};
export type GovernedActionRequestDecision={
 state:"rejected"|"authorization_required";
 reasons:string[];
 capabilityBinding:ReturnType<typeof resolveM12PlanCapability>;
 envelope:ExecutionEnvelope|null;
 authorizationConsumptionAvailable:false;
 executionAvailable:false;
};
export function prepareGovernedActionRequest(input:GovernedActionRequest):GovernedActionRequestDecision{
 const binding=resolveM12PlanCapability(input.plan),reasons:string[]=[];
 const planUnchanged=Boolean(input.planIdentity&&input.planIdentity===input.currentPlanIdentity);
 const confirmationMatches=Boolean(input.confirmation.confirmationId&&input.confirmation.confirmedAt&&input.confirmation.confirmedPlanIdentity===input.planIdentity&&input.confirmation.confirmedCustomerId===input.plan.target.customerId&&input.confirmation.confirmedJourneyId===input.plan.target.journeyId);
 if(!binding.bound)reasons.push(binding.reason);
 if(!planUnchanged)reasons.push("Plan identity changed; prior confirmation cannot be reused.");
 if(!input.actionPermissionGranted)reasons.push("Required action permission is not granted.");
 if(!input.prerequisitesSatisfied)reasons.push("Plan prerequisites are not satisfied.");
 if(!confirmationMatches)reasons.push("Fresh human confirmation is not bound to the exact plan and target.");
 if(!input.plan.proposedOperation)reasons.push("Plan has no proposed operation.");
 if(reasons.length)return{state:"rejected",reasons,capabilityBinding:binding,envelope:null,authorizationConsumptionAvailable:false,executionAvailable:false};
 const envelope=buildExecutionEnvelope({plan:input.plan,organizationId:input.organizationId,planIdentity:input.planIdentity,operation:{type:"inspect_evidence",parameters:{}},confirmation:input.confirmation,createdAt:input.requestedAt,expiresAt:input.expiresAt,idempotencyKey:input.idempotencyKey,auditCorrelationId:input.auditCorrelationId},input.requestedAt);
 if(envelope.state!=="authorized")return{state:"rejected",reasons:envelope.stateReasons,capabilityBinding:binding,envelope,authorizationConsumptionAvailable:false,executionAvailable:false};
 return{state:"authorization_required",reasons:["Governance inputs are valid; persistent authorization must be created and atomically consumed in a later bounded step."],capabilityBinding:binding,envelope,authorizationConsumptionAvailable:false,executionAvailable:false};
}
