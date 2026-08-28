import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceStability, attributionAvailability, candidateKey, classifySource, continuousStopDecision,
  continuousRequestBounds, detectProviderOrdering, evaluateRateCandidate, firstContinuousPages, initialOrderingObserver, isExpectedNewestFirstHeadInsertion, observeOrderingPage, parseContinuousPage, rateLimitDelay,
  type StabilityState,
} from "../lib/commerce/continuous-intelligence";
import { dispatchEligibleSchedules, eligibleScheduledJobs } from "../lib/commerce/continuous-scheduler";
import { investigationFreshness } from "../lib/investigations/freshness";
import { firstRecoverableContinuousPage, summarizeContinuousCheckpointProgress } from "../lib/commerce/commas-continuous-worker";

const initial=():StabilityState=>({consecutiveStableKnownPages:0,pagesScanned:0,unseenRecords:0,changedRecords:0,pageShiftDetected:false});
test("ordinary provider pages persist authoritative quota without Evidence replay overwriting it",()=>{
  const source=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
  assert.match(source,/quota_source:"continuous_provider_response"/);
  assert.match(source,/quota_observed_at:now/);
  assert.match(source,/\.\.\.\(rateLimitEnd!==null\?/);
});
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));

test("Commas ordering is measured rather than assumed",()=>{
  assert.equal(detectProviderOrdering(["2026-08-08T02:00:00Z","2026-08-08T01:00:00Z"]),"newest_first");
  assert.equal(detectProviderOrdering(["2026-08-08T01:00:00Z","2026-08-08T02:00:00Z"]),"oldest_first");
  assert.equal(detectProviderOrdering(["2026-08-08T02:00:00Z","2026-08-08T01:00:00Z","2026-08-08T03:00:00Z"]),"unstable");
  assert.deepEqual(firstContinuousPages("oldest_first",745,3),[743,744,745]);
});

test("continuous ordering observer verifies adjacent newest-first pages and benign boundary overlap",()=>{
  const page=(number:number,first:string,last:string,ids:string[])=>({page:number,direction:"newest_first" as const,firstTimestamp:first,lastTimestamp:last,firstSourceId:ids[0]||null,lastSourceId:ids.at(-1)||null,ids});
  let state=observeOrderingPage(initialOrderingObserver(),page(1,"2026-08-10T00:00:00Z","2026-08-09T00:00:00Z",["a","b"]));
  state=observeOrderingPage(state,page(2,"2026-08-09T00:00:00Z","2026-08-08T00:00:00Z",["b","c"]));
  assert.equal(state.ordering,"newest_first");assert.equal(state.paginationClassification,"benign_boundary_overlap");assert.equal(state.boundaryOverlapCount,1);
  state=observeOrderingPage(state,page(3,"2026-08-08T00:00:00Z","2026-08-07T00:00:00Z",["c","d"]));
  assert.equal(state.ordering,"newest_first");assert.equal(state.paginationClassification,"benign_boundary_overlap");
});

test("continuous ordering observer verifies oldest-first boundaries",()=>{
  const page=(number:number,first:string,last:string,ids:string[])=>({page, direction:"oldest_first" as const, firstTimestamp:first,lastTimestamp:last,firstSourceId:ids[0]||null,lastSourceId:ids.at(-1)||null,ids});
  let state=observeOrderingPage(initialOrderingObserver(),page(1,"2026-08-01T00:00:00Z","2026-08-02T00:00:00Z",["a","b"]));
  state=observeOrderingPage(state,page(2,"2026-08-02T00:00:00Z","2026-08-03T00:00:00Z",["c","d"]));
  assert.equal(state.ordering,"oldest_first");assert.equal(state.paginationClassification,"none");
});

test("continuous ordering observer fails closed for unknown, mixed, reversed, and unsafe duplicate pages",()=>{
  const page=(page:number,direction:any,first:string,last:string,ids:string[])=>({page,direction,firstTimestamp:first,lastTimestamp:last,firstSourceId:ids[0]||null,lastSourceId:ids.at(-1)||null,ids});
  let state=observeOrderingPage(initialOrderingObserver(),page(1,"unknown", "2026-08-10T00:00:00Z","2026-08-10T00:00:00Z",["a","b"]));
  assert.equal(state.ordering,"unknown");
  state=observeOrderingPage(state,page(2,"newest_first","2026-08-09T00:00:00Z","2026-08-08T00:00:00Z",["c","d"]));assert.equal(state.ordering,"unstable");
  state=observeOrderingPage(observeOrderingPage(initialOrderingObserver(),page(1,"newest_first","2026-08-10T00:00:00Z","2026-08-09T00:00:00Z",["a","b","c"])),page(2,"newest_first","2026-08-08T00:00:00Z","2026-08-07T00:00:00Z",["c","a","d"]));
  assert.equal(state.paginationClassification,"pagination_instability");
  state=observeOrderingPage(observeOrderingPage(initialOrderingObserver(),page(1,"newest_first","2026-08-10T00:00:00Z","2026-08-09T00:00:00Z",["a","b"])),page(2,"newest_first","2026-08-10T00:00:00Z","2026-08-09T00:00:00Z",["c","d"]));
  assert.equal(state.ordering,"unstable");assert.equal(state.paginationClassification,"pagination_instability");
  state=observeOrderingPage(initialOrderingObserver(),page(1,"newest_first","2026-08-10T00:00:00Z","2026-08-09T00:00:00Z",["a","a"]));assert.equal(state.ordering,"unstable");
});

test("middle-page recovery replay cannot claim global provider ordering",()=>{
  const state=observeOrderingPage(initialOrderingObserver(),{page:4,direction:"unknown",firstTimestamp:"2026-08-08T00:00:00Z",lastTimestamp:"2026-08-07T00:00:00Z",firstSourceId:"a",lastSourceId:"b",ids:["a","b"]});
  assert.equal(state.ordering,"unknown");assert.equal(state.pagesObserved,1);
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

test("five new newest-first head records safely shift known pages without requesting reconciliation",()=>{
  const prior=Array.from({length:300},(_,index)=>`known-${index}`),current=[...Array.from({length:5},(_,index)=>`new-${index}`),...prior.slice(0,295)];
  let state=initial();
  for(let page=1;page<=3;page++){
    const ids=current.slice((page-1)*100,page*100),changes=ids.map((id)=>id.startsWith("new-")?"new" as const:"source_identical" as const),knownIds=new Set(ids.filter((id)=>!id.startsWith("new-")));
    state=advanceStability(state,{page,totalPages:10,totalItems:1005,ids,timestamps:[],fingerprint:`next-${page}`,knownIds,priorFingerprint:`prior-${page}`,expectedNewestFirstHeadInsertion:isExpectedNewestFirstHeadInsertion(prior,current.slice(0,page*100))},changes);
  }
  assert.equal(state.pageShiftDetected,false);assert.equal(state.consecutiveStableKnownPages,2);
  assert.deepEqual(continuousStopDecision({state,ordering:"newest_first",page:3,totalPages:10,maxPages:5,rateLimitRemaining:9000}),{stop:true,reason:"stable_known_boundary",deeperReconciliationRequired:false});
});

test("newest-first alignment still rejects missing, reordered, duplicated, and mid-feed movement",()=>{
  const prior=Array.from({length:300},(_,index)=>`known-${index}`),head=["new-0","new-1",...prior.slice(0,198)];
  assert.equal(isExpectedNewestFirstHeadInsertion(prior,head),true);
  assert.equal(isExpectedNewestFirstHeadInsertion(prior,["new-0",...prior.slice(1,200)]),false);
  const reordered=[...head];[reordered[50],reordered[51]]=[reordered[51],reordered[50]];assert.equal(isExpectedNewestFirstHeadInsertion(prior,reordered),false);
  assert.equal(isExpectedNewestFirstHeadInsertion(prior,["new-0",...prior.slice(0,50),prior[49],...prior.slice(50,198)]),false);
  assert.equal(isExpectedNewestFirstHeadInsertion(prior,["new-0",...prior.slice(0,100),"new-middle",...prior.slice(100,198)]),false);
  const shifted=advanceStability(initial(),{page:2,totalPages:10,totalItems:1000,ids:prior.slice(1,101),timestamps:[],fingerprint:"next",knownIds:new Set(prior),priorFingerprint:"prior",expectedNewestFirstHeadInsertion:false},Array(100).fill("source_identical"));
  assert.equal(shifted.pageShiftDetected,true);
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

test("unknown-quota bootstrap is capped to one request and cannot traverse page two",()=>{
  assert.deepEqual(continuousRequestBounds({bootstrap:true,mode:"continuous",maxPages:99,perPage:100,overlapPages:3}),{perPage:1,maxPages:1,overlapPages:1});
  assert.throws(()=>continuousRequestBounds({bootstrap:true,mode:"deep_reconciliation"}),/continuous mode only/);
});

test("stranded running checkpoint is the resumable page and completed progress is durable",()=>{
  const rows=[
    {page:1,state:"completed",metadata:{provider_attempts:1,new_records:100,updated_records:0,unchanged_records:0,evidence_reused:false}},
    {page:2,state:"completed",metadata:{provider_attempts:1,new_records:100,updated_records:0,unchanged_records:0,evidence_reused:false}},
    {page:3,state:"completed",metadata:{provider_attempts:1,new_records:67,updated_records:33,unchanged_records:0,evidence_reused:false}},
    {page:4,state:"running",metadata:{}},
  ];
  assert.equal(firstRecoverableContinuousPage(rows),4);
  assert.deepEqual(summarizeContinuousCheckpointProgress(rows),{
    pagesCompleted:3,providerRequests:3,recordsSeen:300,recordsCreated:267,recordsUpdated:33,recordsUnchanged:0,evidenceWrites:3,evidenceReuses:0,
  });
});

test("replayed Evidence contributes no provider request and preserves idempotent progress accounting",()=>{
  const rows=[
    {page:1,state:"completed",metadata:{provider_attempts:1,new_records:100,updated_records:0,unchanged_records:0,evidence_reused:false}},
    {page:2,state:"completed",metadata:{provider_attempts:1,new_records:100,updated_records:0,unchanged_records:0,evidence_reused:false}},
    {page:3,state:"completed",metadata:{provider_attempts:1,new_records:67,updated_records:33,unchanged_records:0,evidence_reused:false}},
    {page:4,state:"completed",metadata:{provider_attempts:0,new_records:0,updated_records:0,unchanged_records:100,evidence_reused:true}},
  ];
  const progress=summarizeContinuousCheckpointProgress(rows);
  assert.equal(progress.pagesCompleted,4);
  assert.equal(progress.providerRequests,3);
  assert.equal(progress.evidenceReuses,1);
  assert.equal(progress.recordsSeen,400);
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

test("production scheduler requires explicit activation and honors global and Connection kill switches",()=>{
  const due={id:"s",enabled:true,activationState:"enabled" as const,globalAllowed:true,connectionPaused:false,nextOverlapAt:"2026-08-08T11:00:00Z",nextDeepReconciliationAt:null};
  assert.deepEqual(eligibleScheduledJobs(due,new Date("2026-08-08T12:00:00Z")),["continuous"]);
  assert.deepEqual(eligibleScheduledJobs({...due,activationState:"ready"},new Date("2026-08-08T12:00:00Z")),[]);
  assert.deepEqual(eligibleScheduledJobs({...due,globalAllowed:false},new Date("2026-08-08T12:00:00Z")),[]);
  assert.deepEqual(eligibleScheduledJobs({...due,connectionPaused:true},new Date("2026-08-08T12:00:00Z")),[]);
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
