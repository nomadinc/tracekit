import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceStability, attributionAvailability, candidateKey, classifySource, continuousStopDecision,
  detectProviderOrdering, evaluateRateCandidate, firstContinuousPages, parseContinuousPage, rateLimitDelay,
  type StabilityState,
} from "../lib/commerce/continuous-intelligence";
import { dispatchEligibleSchedules, eligibleScheduledJobs } from "../lib/commerce/continuous-scheduler";
import { investigationFreshness } from "../lib/investigations/freshness";

const initial=():StabilityState=>({consecutiveStableKnownPages:0,pagesScanned:0,unseenRecords:0,changedRecords:0,pageShiftDetected:false});
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));

test("Commas ordering is measured rather than assumed",()=>{
  assert.equal(detectProviderOrdering(["2026-08-08T02:00:00Z","2026-08-08T01:00:00Z"]),"newest_first");
  assert.equal(detectProviderOrdering(["2026-08-08T01:00:00Z","2026-08-08T02:00:00Z"]),"oldest_first");
  assert.equal(detectProviderOrdering(["2026-08-08T02:00:00Z","2026-08-08T01:00:00Z","2026-08-08T03:00:00Z"]),"unstable");
  assert.deepEqual(firstContinuousPages("oldest_first",745,3),[743,744,745]);
});

test("continuous parser validates required identity before normalization",()=>{
  const parsed=parseContinuousPage(bytes({data:{transactions:[{id:"tx-1",transaction_date:"2026-08-08T01:00:00Z"}],pagination:{current_page:1,total_pages:2,total_items:101}}}));
  assert.equal(parsed.totalPages,2);assert.equal(parsed.totalItems,101);
  assert.throws(()=>parseContinuousPage(bytes({transactions:[{transaction_date:"2026-08-08T01:00:00Z"}]})),/Unexpected Commas Transaction page schema/);
});

test("source and normalizer changes remain distinct",()=>{
  assert.equal(classifySource({nextPayloadHash:"a",nextNormalizerVersion:"v1"}),"new");
  assert.equal(classifySource({priorPayloadHash:"a",nextPayloadHash:"b",priorNormalizerVersion:"v1",nextNormalizerVersion:"v1"}),"source_changed");
  assert.equal(classifySource({priorPayloadHash:"a",nextPayloadHash:"a",priorNormalizerVersion:"v0",nextNormalizerVersion:"v1"}),"normalizer_changed");
  assert.equal(classifySource({priorPayloadHash:"a",nextPayloadHash:"a",priorNormalizerVersion:"v1",nextNormalizerVersion:"v1"}),"source_identical");
});

test("two known unchanged pages form the stability boundary",()=>{
  const page=(number:number,priorFingerprint:string|null)=>({page:number,totalPages:10,totalItems:1000,ids:[`a${number}`,`b${number}`],timestamps:["2026-08-08T02:00:00Z","2026-08-08T01:00:00Z"],fingerprint:`f${number}`,knownIds:new Set([`a${number}`,`b${number}`]),priorFingerprint});
  const one=advanceStability(initial(),page(1,"f1"),["source_identical","source_identical"]);
  const two=advanceStability(one,page(2,"f2"),["source_identical","source_identical"]);
  assert.equal(two.consecutiveStableKnownPages,2);
  assert.deepEqual(continuousStopDecision({state:two,ordering:"newest_first",page:2,totalPages:10,maxPages:8,rateLimitRemaining:9000}),{stop:true,reason:"stable_known_boundary",deeperReconciliationRequired:false});
});

test("page movement is diagnosed without treating known records as updates",()=>{
  const state=advanceStability(initial(),{page:1,totalPages:10,totalItems:1000,ids:["a"],timestamps:["2026-08-08T02:00:00Z"],fingerprint:"new-page",knownIds:new Set(["a"]),priorFingerprint:"old-page"},["source_identical"]);
  assert.equal(state.pageShiftDetected,true);assert.equal(state.changedRecords,0);
});

test("new and changed records reset a known stability boundary",()=>{
  const state=advanceStability({...initial(),consecutiveStableKnownPages:1},{page:2,totalPages:10,totalItems:1000,ids:["new"],timestamps:["2026-08-08T02:00:00Z"],fingerprint:"f",knownIds:new Set()},["new"]);
  assert.equal(state.consecutiveStableKnownPages,0);assert.equal(state.unseenRecords,1);
});

test("unknown ordering and low quota fail conservatively",()=>{
  assert.equal(continuousStopDecision({state:initial(),ordering:"unknown",page:1,totalPages:10,maxPages:8,rateLimitRemaining:9000}).reason,"provider_ordering_unverified");
  assert.equal(continuousStopDecision({state:initial(),ordering:"newest_first",page:1,totalPages:10,maxPages:8,rateLimitRemaining:50}).reason,"rate_limit_safety_boundary");
  assert.equal(rateLimitDelay({status:429,retryAfterSeconds:7,remaining:50,attempt:1}),7000);
});

test("absence of live attribution source is not failed attribution",()=>{
  assert.equal(attributionAvailability({orderAt:"2026-08-08T00:00:00Z",liveSourceAvailable:false,attributed:false}),"attribution_source_unavailable");
  assert.equal(attributionAvailability({orderAt:"2026-08-08T00:00:00Z",sourceStart:"2026-04-01T00:00:00Z",sourceEnd:"2026-08-07T00:00:00Z",liveSourceAvailable:true,attributed:false}),"outside_source_evidence");
  assert.equal(attributionAvailability({orderAt:"2026-05-01T00:00:00Z",sourceStart:"2026-04-01T00:00:00Z",sourceEnd:"2026-08-07T00:00:00Z",liveSourceAvailable:true,attributed:false}),"eligible_unattributed");
});

test("candidate generation is maturity and sample aware",()=>{
  assert.equal(evaluateRateCandidate({currentRate:.25,baselineRate:.1,sampleSize:10,mature:true}).reason,"sample_too_small");
  assert.equal(evaluateRateCandidate({currentRate:.25,baselineRate:.1,sampleSize:1000,mature:false}).reason,"cohort_immature");
  assert.equal(evaluateRateCandidate({currentRate:.25,baselineRate:.1,sampleSize:1000,mature:true,existingInvestigation:true}).reason,"existing_investigation_covers_signal");
  assert.equal(evaluateRateCandidate({currentRate:.25,baselineRate:.1,sampleSize:1000,mature:true}).create,true);
});

test("candidate identity is deterministic and changes with evidence context",()=>{
  const base={organizationId:"org",candidateType:"product_dispute_rate",metric:"rate",entityType:"product",entityId:"oto2",periodStart:"2026-04-01",periodEnd:"2026-08-08",baselineVersion:"v1"};
  assert.equal(candidateKey(base),candidateKey(base));
  assert.notEqual(candidateKey(base),candidateKey({...base,periodEnd:"2026-08-09"}));
});

test("scheduler prioritizes due deep reconciliation and ignores disabled schedules",async()=>{
  const now=new Date("2026-08-08T12:00:00Z"),schedule={id:"s",enabled:true,nextOverlapAt:"2026-08-08T11:00:00Z",nextDeepReconciliationAt:"2026-08-07T11:00:00Z"};
  assert.deepEqual(eligibleScheduledJobs(schedule,now),["deep_reconciliation"]);
  assert.deepEqual(eligibleScheduledJobs({...schedule,enabled:false},now),[]);
  const jobs:string[]=[];assert.equal(await dispatchEligibleSchedules({schedules:[schedule],now,enqueue:async(id,kind)=>{jobs.push(`${id}:${kind}`);}}),1);
  assert.deepEqual(jobs,["s:deep_reconciliation"]);
});

test("zero-change boundary is a completed outcome",()=>{
  const stable={...initial(),consecutiveStableKnownPages:2,pagesScanned:2};
  const result=continuousStopDecision({state:stable,ordering:"newest_first",page:2,totalPages:745,maxPages:8,rateLimitRemaining:9900});
  assert.equal(result.reason,"stable_known_boundary");assert.equal(result.deeperReconciliationRequired,false);
});

test("Investigation staleness is resource, entity, and period scoped",()=>{
  const dependencies=[{resourceType:"transactions",entityType:"provider_product",entityId:"oto2",periodStart:"2026-04-01T00:00:00Z",periodEnd:"2026-08-08T23:59:59Z"}];
  assert.equal(investigationFreshness({dependencies,changes:[{organizationId:"org",resourceType:"transactions",entityType:"provider_product",entityId:"other",observedAt:"2026-05-01T00:00:00Z"}]}).status,"current");
  assert.equal(investigationFreshness({dependencies,changes:[{organizationId:"org",resourceType:"transactions",entityType:"provider_product",entityId:"oto2",observedAt:"2026-05-01T00:00:00Z"}]}).status,"new_evidence_available");
  assert.equal(investigationFreshness({dependencies,changes:[{organizationId:"org",resourceType:"transactions",entityType:"provider_product",entityId:"oto2",observedAt:"2026-09-01T00:00:00Z"}]}).status,"current");
});
