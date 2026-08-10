export type CapabilityState = "disabled" | "ready" | "enabled" | "paused";
export type TkidSourceState = "disabled" | "ready" | "shadow" | "paused" | "revoked";
export type InvestigationTkidState = "disabled" | "review_only" | "approved";
export type ReadinessClass = "ready" | "ready_but_disabled" | "blocked_config" | "blocked_approval" | "blocked_implementation";

export type ProductionConfig = {
  workerHost?: string;
  schedulerEnabled?: string;
  commerceKillSwitch?: string;
  overlapCron?: string;
  deepCron?: string;
  candidateCron?: string;
  refreshCron?: string;
  quotaMinimumRemaining?: string;
  deepRequestBudget?: string;
  evidenceBucket?: string;
  tkidIngestionEnabled?: string;
  tkidPublicAssetVersion?: string;
  tkidHandoffKeyRef?: string;
  tkidAbuseAdapter?: string;
  tkidRetentionPolicy?: string;
  tkidErasurePolicy?: string;
  tkidConsentMode?: string;
  alertDestinationRef?: string;
};

export type ReadinessBlocker = {capability:string;code:string;classification:"config"|"approval"|"implementation"};
const truthy=(value?:string)=>value==="true";
const positive=(value?:string)=>Boolean(value&&Number.isFinite(Number(value))&&Number(value)>0);
const cron=(value?:string)=>Boolean(value&&value.trim().split(/\s+/).length===5);
const configured=(value?:string)=>Boolean(value&&value.trim()&&!/replace|todo|example/i.test(value));

export function validateProductionConfig(config:ProductionConfig) {
  const blockers:ReadinessBlocker[]=[];
  const require=(capability:string,code:string,ok:boolean,classification:ReadinessBlocker["classification"]="config")=>{if(!ok)blockers.push({capability,code,classification});};
  require("commerce","worker_host_missing",config.workerHost==="cloudflare_worker_queue");
  require("commerce","overlap_schedule_invalid",cron(config.overlapCron));
  require("commerce","deep_schedule_invalid",cron(config.deepCron));
  require("commerce","candidate_schedule_invalid",cron(config.candidateCron));
  require("commerce","refresh_schedule_invalid",cron(config.refreshCron));
  require("commerce","quota_guard_missing",positive(config.quotaMinimumRemaining));
  require("commerce","deep_budget_missing",positive(config.deepRequestBudget));
  require("commerce","evidence_bucket_missing",configured(config.evidenceBucket));
  require("commerce","kill_switch_not_asserted",config.commerceKillSwitch==="disabled");
  require("tkid","sdk_version_missing",configured(config.tkidPublicAssetVersion));
  require("tkid","handoff_key_reference_missing",configured(config.tkidHandoffKeyRef));
  require("tkid","distributed_abuse_adapter_missing",configured(config.tkidAbuseAdapter),"implementation");
  require("tkid","retention_policy_unapproved",configured(config.tkidRetentionPolicy),"approval");
  require("tkid","erasure_policy_unapproved",configured(config.tkidErasurePolicy),"approval");
  require("tkid","consent_policy_unapproved",["essential","analytics_allowed"].includes(config.tkidConsentMode||""),"approval");
  require("alerting","alert_destination_missing",configured(config.alertDestinationRef),"config");
  return {
    applicationStart:"ready" as ReadinessClass,
    commerce:blockers.some(x=>x.capability==="commerce")?"blocked_config" as ReadinessClass:(truthy(config.schedulerEnabled)?"ready" as ReadinessClass:"ready_but_disabled" as ReadinessClass),
    tkid:blockers.some(x=>x.capability==="tkid"&&x.classification==="implementation")?"blocked_implementation" as ReadinessClass:blockers.some(x=>x.capability==="tkid"&&x.classification==="approval")?"blocked_approval" as ReadinessClass:blockers.some(x=>x.capability==="tkid")?"blocked_config" as ReadinessClass:(truthy(config.tkidIngestionEnabled)?"ready" as ReadinessClass:"ready_but_disabled" as ReadinessClass),
    alerting:blockers.some(x=>x.capability==="alerting")?"blocked_config" as ReadinessClass:"ready" as ReadinessClass,
    blockers,
  };
}

export type QuotaPolicy={minimumRemaining:number;deepMinimumRemaining:number;maxOverlapRequests:number;maxDeepRequests:number};
export function quotaCircuitDecision(input:{remaining:number|null;status?:number;retryAfterSeconds?:number|null;mode:"continuous"|"deep_reconciliation";policy:QuotaPolicy}) {
  if(input.status===429)return{allow:false,reason:"provider_rate_limited",retryAtSeconds:Math.max(1,Math.min(input.retryAfterSeconds||60,3600))};
  if(input.remaining===null)return{allow:false,reason:"quota_state_unknown",retryAtSeconds:null};
  const floor=input.mode==="deep_reconciliation"?input.policy.deepMinimumRemaining:input.policy.minimumRemaining;
  const budget=input.mode==="deep_reconciliation"?input.policy.maxDeepRequests:input.policy.maxOverlapRequests;
  if(input.remaining-budget<floor)return{allow:false,reason:"quota_headroom_protected",retryAtSeconds:null};
  return{allow:true,reason:"quota_available",retryAtSeconds:null};
}

export function productionFreshness(input:{lastSuccessfulAt:string|null;now:string;overlapMinutes:number;lastDeepAt:string|null;deepDays:number}) {
  if(!input.lastSuccessfulAt)return{status:"blocked",lagMinutes:null,deepStatus:input.lastDeepAt?"current":"missing"};
  const lag=(Date.parse(input.now)-Date.parse(input.lastSuccessfulAt))/60000;
  const status=lag<=input.overlapMinutes*2?"healthy":lag<=input.overlapMinutes*4?"delayed":"stale";
  const deepAge=input.lastDeepAt?(Date.parse(input.now)-Date.parse(input.lastDeepAt))/86400000:null;
  return{status,lagMinutes:lag,deepStatus:deepAge===null?"missing":deepAge<=input.deepDays?"current":"overdue"};
}

export type ShadowProofLimits={businessContextCount:1;funnelCount:1;maxJourneys:number;maxEvents:number;durationHours:number};
export function validateShadowProofLimits(value:ShadowProofLimits){
  return value.businessContextCount===1&&value.funnelCount===1&&value.maxJourneys>=1&&value.maxJourneys<=100&&value.maxEvents>=value.maxJourneys&&value.maxEvents<=2000&&value.durationHours>=1&&value.durationHours<=72;
}

export function checkoutFailureDisposition(input:{tkidAvailable:boolean;handoffValid:boolean;associationSucceeded:boolean}) {
  const gaps:string[]=[];if(!input.tkidAvailable)gaps.push("tkid_unavailable");if(!input.handoffValid)gaps.push("handoff_failed");if(!input.associationSucceeded)gaps.push("checkout_association_failed");
  return{checkoutAllowed:true,evidenceCompleteness:gaps.length?"partial":"complete",gaps};
}

export type HandoffKey={id:string;state:"current"|"previous"|"revoked";notBefore:string;notAfter:string};
export function handoffKeyDecision(keys:HandoffKey[],issuedAt:string){const at=Date.parse(issuedAt);return keys.find(key=>key.state!=="revoked"&&Date.parse(key.notBefore)<=at&&at<Date.parse(key.notAfter))||null;}

export function safeOperationalMetric(input:Record<string,unknown>){
  const forbidden=/email|phone|name|address|ip|user.?agent|payload|evidence|secret|token|cipher|storage/i;
  for(const key of Object.keys(input))if(forbidden.test(key))throw new Error("unsafe operational metric");
  return structuredClone(input);
}
