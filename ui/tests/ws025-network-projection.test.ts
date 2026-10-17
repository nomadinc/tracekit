import assert from "node:assert/strict";
import test from "node:test";
import { projectSnapshot } from "../lib/network-intelligence/safe-projection";
import { NetworkDataUnavailable } from "../lib/network-intelligence/contracts";
import { AT,registries,source } from "./ws025-network-fixtures";
const ctx={receivedAt:AT,previousRevisionReceived:false};
test("explicit FALSE, ASN and confidence zero survive with local provenance",()=>{
  const out=projectSnapshot(source(),ctx,registries);assert.equal(out.summary.network.signals.proxy.state,"FALSE");assert.equal(out.summary.network.signals.proxy.confidence?.value,0);assert.equal(out.summary.network.asn.value,64512);assert.deepEqual(out.evidenceReferences.proxy,["e1"]);assert.equal(out.evidence[0].value,false);
  const text=JSON.stringify(out);for(const field of ["sessionRef","eventRef","tenantRef","evidence_proxy"])assert.equal(text.includes(field),false);
});
for(const secret of ["198.51.100.7","2001:db8::7","::1","ipref:synthetic","m25/vault/synthetic","sk_live_synthetic","SPUR_TOKEN","credential-synthetic","token_hash"]){test("source-derived strings cannot leak: "+secret,()=>{
  const s=source();const dirty=s as unknown as Record<string,unknown>;dirty.extensions={deep:{rawIp:secret,token:secret,rawProviderResponse:{value:secret}}};
  s.evidence[0].provider=secret;s.evidence[0].value=secret as unknown as boolean;
  const out=projectSnapshot(s,ctx,registries);assert.equal(JSON.stringify(out).includes(secret),false);assert.equal(out.summary.network.signals.proxy.state,"UNKNOWN");
});}
test("arbitrary nested extensions and errors are never spread",()=>{
  const s=source() as unknown as Record<string,unknown>;s.rawProviderResponse={credential:"private"};s.routingDecision="money";s.errors=[{stage:"NETWORK_LIVE",code:"PROVIDER_UNAVAILABLE",retryable:false,message:"private"}];
  const out=projectSnapshot(s,ctx,registries);assert.deepEqual(out.errors,[{stage:"NETWORK_LIVE",code:"PROVIDER_UNAVAILABLE",retryable:false}]);assert.equal(JSON.stringify(out).includes("private"),false);
});
test("unrecognized provider becomes OTHER without raw echo",()=>{
  const s=source();s.evidence[0].provider="future-provider-synthetic";const out=projectSnapshot(s,ctx,registries);assert.equal(out.evidence[0].provider,"OTHER");assert.equal(JSON.stringify(out).includes("future-provider"),false);
});
for(const c of [{value:999,basis:"SOURCE_REPORTED"},{value:NaN,basis:"SOURCE_REPORTED"},{value:0.5,basis:"unsupported"},{value:0.5,basis:"EDGE_DERIVED"},{value:0.5,basis:"OBSERVATION_QUALITY",derivationVersion:"unapproved"}]){test("invalid confidence safely omitted: "+JSON.stringify(c),()=>{
  const s=source();s.intelligence.network.proxy.confidence=c as typeof s.intelligence.network.proxy.confidence;
  if(Number.isNaN(c.value)){assert.throws(()=>projectSnapshot(s,ctx,registries),NetworkDataUnavailable);return;}
  assert.equal(projectSnapshot(s,ctx,registries).summary.network.signals.proxy.confidence,null);
});}
test("approved derived confidence retained",()=>{
  const s=source();s.intelligence.network.proxy.confidence={value:0,basis:"EDGE_DERIVED",derivationVersion:"test-v1"} as typeof s.intelligence.network.proxy.confidence;
  assert.equal(projectSnapshot(s,ctx,registries).summary.network.signals.proxy.confidence?.derivationVersion,"test-v1");
});
test("missing evidence is UNKNOWN/INVALID, never FALSE",()=>{
  const s=source();s.evidence=[];const out=projectSnapshot(s,ctx,registries);assert.equal(out.summary.network.signals.proxy.state,"UNKNOWN");assert.equal(out.summary.network.signals.proxy.availability,"INVALID");assert.equal(out.summary.network.signals.vpn.availability,"ABSENT");
});
test("explicit UNKNOWN remains distinct",()=>{
  const s=source();s.intelligence.network.proxy.state="UNKNOWN";const a=projectSnapshot(s,ctx,registries).summary.network.signals.proxy;assert.equal(a.availability,"EXPLICIT_UNKNOWN");assert.equal(a.confidence,null);
});
test("contradictory evidence is CONFLICTING with null confidence",()=>{
  const s=source();s.evidence.push({...s.evidence[0],id:"evidence_opposite",value:true});const a=projectSnapshot(s,ctx,registries).summary.network.signals.proxy;assert.equal(a.state,"UNKNOWN");assert.equal(a.availability,"CONFLICTING");assert.equal(a.conflictCode,"SOURCE_CONFLICT");assert.equal(a.confidence,null);
});
test("assertion mismatch is not a confident classification",()=>{
  const s=source();s.evidence[0].value=true;const a=projectSnapshot(s,ctx,registries).summary.network.signals.proxy;assert.equal(a.conflictCode,"ASSERTION_EVIDENCE_MISMATCH");assert.equal(a.state,"UNKNOWN");
});
test("broken evidence references are not serialized",()=>{
  const s=source();s.intelligence.network.proxy.evidenceRefs=["evidence_missing"];const out=projectSnapshot(s,ctx,registries);assert.deepEqual(out.evidenceReferences.proxy,[]);assert.equal(out.summary.network.signals.proxy.availability,"INVALID");
});
test("duplicate evidence IDs invalidate references",()=>{
  const s=source();s.evidence.push({...s.evidence[0]});const out=projectSnapshot(s,ctx,registries);assert.equal(out.summary.network.signals.proxy.state,"UNKNOWN");
});
test("unapproved scalar strings are UNSUPPORTED, not labels",()=>{
  const s=source() as unknown as Record<string,unknown>;const n=(s.intelligence as {network:Record<string,unknown>}).network;n.networkType={state:"KNOWN",value:"unreviewed",freshness:"CURRENT",evidenceRefs:[]};
  const out=projectSnapshot(s,ctx,registries);assert.equal(out.summary.network.networkType.availability,"UNSUPPORTED");assert.equal(out.summary.network.networkType.value,null);
});
test("129 evidence entries cause deterministic rejection, not truncation",()=>{
  const s=source();s.evidence=Array.from({length:129},(_,i)=>({...s.evidence[0],id:"evidence_"+i}));assert.throws(()=>projectSnapshot(s,ctx,registries),NetworkDataUnavailable);
});
for(const bad of ["2026-02-30T00:00:00.000Z","not-a-time","2026-10-16","2026-10-16T12:00:00Z"]){test("malformed source timestamp: "+bad,()=>{
  const s=source();s.updatedAt=bad;assert.throws(()=>projectSnapshot(s,ctx,registries),NetworkDataUnavailable);
});}
test("cycles/accessors/deep source fail generically without executing accessors",()=>{
  let accesses=0;const s=source();Object.defineProperty(s,"extension",{enumerable:true,get:()=>{accesses++;throw new Error("private");}});assert.throws(()=>projectSnapshot(s,ctx,registries),NetworkDataUnavailable);assert.equal(accesses,0);
  const deep:Record<string,unknown>={};let node=deep;for(let i=0;i<20;i++){node.next={};node=node.next as Record<string,unknown>;}assert.throws(()=>projectSnapshot({...source(),deep},ctx,registries),NetworkDataUnavailable);
});
test("protected IP text in an observation identifier fails required output",()=>{
  const s=source();s.observationId="obs_198.51.100.7";assert.throws(()=>projectSnapshot(s,ctx,registries),NetworkDataUnavailable);
});
test("malformed evidence timestamps remove dependent assertion support",()=>{
  const s=source();s.evidence[0].observedAt="2026-02-30T00:00:00.000Z";const out=projectSnapshot(s,ctx,registries);assert.equal(out.summary.network.signals.proxy.availability,"INVALID");assert.equal(out.summary.network.signals.proxy.state,"UNKNOWN");
});
test("missing approved semantic registries do not fabricate source values",()=>{
  const out=projectSnapshot(source(),ctx);assert.equal(out.derivationRuleVersion,null);assert.equal(out.semanticsVersion,null);assert.equal(out.summary.network.asn.value,64512);
});
