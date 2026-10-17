import assert from "node:assert/strict";
import test from "node:test";
import type { NetworkDTOs } from "../lib/network-intelligence/dtos";
import { boundedJSON,NetworkDataUnavailable } from "../lib/network-intelligence/contracts";
import { serializeOutput,validateOutput } from "../lib/network-intelligence/output-validation";
import { distributionBuckets } from "../lib/network-intelligence/safe-projection";
import { dtos,registries } from "./ws025-network-fixtures";
const kinds=["overview","list","detail","revision","diagnostics"] as const;
for(const kind of kinds){
  test(kind+" validates and serializes through independent runtime schema",()=>{const dto=dtos()[kind];assert.equal(validateOutput(kind,dto,registries),true);assert.deepEqual(JSON.parse(serializeOutput(kind,dto,registries)),dto);});
  test(kind+" rejects additional properties at EVERY object nesting",()=>{
    const root=dtos()[kind];const paths:Array<Array<string|number>>=[];
    function walk(v:unknown,path:Array<string|number>){if(!v||typeof v!=="object")return;if(!Array.isArray(v))paths.push(path);for(const [k,x] of Object.entries(v))walk(x,[...path,Array.isArray(v)?Number(k):k]);}walk(root,[]);
    for(const path of paths){const copy=structuredClone(root);let obj:unknown=copy;for(const p of path)obj=(obj as Record<string|number,unknown>)[p];(obj as Record<string,unknown>).extra="unreviewed";assert.equal(validateOutput(kind,copy,registries),false,JSON.stringify(path));}
  });
  test(kind+" rejects missing top-level keys",()=>{for(const key of Object.keys(dtos()[kind])){const dto=structuredClone(dtos()[kind]) as unknown as Record<string,unknown>;delete dto[key];assert.equal(validateOutput(kind,dto,registries),false,key);}});
}
function reject<K extends keyof NetworkDTOs>(kind:K,edit:(dto:NetworkDTOs[K])=>void){const dto=dtos()[kind];edit(dto);assert.equal(validateOutput(kind,dto,registries),false);assert.throws(()=>serializeOutput(kind,dto,registries),NetworkDataUnavailable);}
test("OTHER valid overflow is separate from UNKNOWN",()=>{
  const dto=dtos().overview;dto.networkTypes=[{kind:"OTHER",value:null,observations:1},{kind:"UNKNOWN",value:null,observations:0}];assert.equal(validateOutput("overview",dto,registries),true);
  reject("overview",d=>{d.networkTypes=[{kind:"OTHER",value:"RESIDENTIAL",observations:1} as unknown as NetworkDTOs["overview"]["networkTypes"][number]];});
});
test("distribution duplicate buckets and denominator mismatch rejected",()=>{
  reject("overview",d=>{d.networkTypes.push({...d.networkTypes[0]});});reject("overview",d=>{d.countries[0].observations=0;});reject("overview",d=>{d.signals.proxy.falseCount=0;});reject("overview",d=>{d.statusCounts.COMPLETE=2;});
});
test("separate evidence denominator enforced",()=>{reject("diagnostics",d=>{d.evidenceFreshness.denominatorEvidenceItems=1;});reject("diagnostics",d=>{d.providerCoverage[0].denominatorObservations=2;});});
test("sampling cannot claim historical rate or visitors",()=>{reject("list",d=>{(d.context.sampling as unknown as Record<string,unknown>).historicalSamplingRate=0.25;});});
test("field-specific evidence and references enforced",()=>{
  reject("detail",d=>{d.current.evidence[0].value="FALSE";});reject("detail",d=>{d.current.evidenceReferences.proxy=["e2"];});reject("detail",d=>{d.current.evidence[1].id="e1";});
});
test("confidence bounds, basis and approved derived version enforced",()=>{
  reject("detail",d=>{d.current.summary.network.signals.proxy.confidence={basis:"SOURCE_REPORTED",value:2,derivationVersion:null};});
  reject("detail",d=>{d.current.summary.network.signals.proxy.confidence={basis:"EDGE_DERIVED",value:0.5,derivationVersion:"unapproved"};});
});
test("conflicting evidence cannot retain FALSE or confidence",()=>{
  reject("detail",d=>{d.current.summary.network.signals.proxy.availability="CONFLICTING";d.current.summary.network.signals.proxy.conflictCode="SOURCE_CONFLICT";});
});
test("scope union is exact and V1 workspace mode disabled",()=>{
  reject("detail",d=>{d.scope={kind:"WORKSPACE",workspaceId:"workspace_a"};});reject("list",d=>{d.context.scope={kind:"ORGANIZATION",workspaceId:"workspace_a"} as unknown as NetworkDTOs["list"]["context"]["scope"];});
});
test("invalid enums, times, IDs and numeric types rejected",()=>{
  reject("list",d=>{d.observations[0].status="bad" as never;});reject("list",d=>{d.observations[0].observationId="tenant_synthetic_00000001";});reject("list",d=>{d.observations[0].receivedAt="2026-02-30T00:00:00.000Z";});reject("overview",d=>{d.observationCount=NaN;});reject("overview",d=>{d.observationCount=-1;});
});
test("128 evidence maximum, string/depth and serialized size limits",()=>{
  reject("detail",d=>{d.current.evidence=Array.from({length:129},(_,i)=>({...d.current.evidence[0],id:"e"+(i+1)}));});
  reject("list",d=>{d.page.nextCursor="a".repeat(1025);d.page.hasMore=true;});
  const oversized=Array.from({length:200},()=>"a".repeat(4000));assert.equal(boundedJSON(oversized),false);assert.equal(validateOutput("list",oversized,registries),false);
});
test("zero-valued overview counts are valid",()=>{
  const d=dtos().overview;d.observationCount=0;d.timeline[0].observations=0;d.providerCoverage=[];
  for(const k of Object.keys(d.statusCounts) as Array<keyof typeof d.statusCounts>)d.statusCounts[k]=0;
  for(const buckets of [d.networkTypes,d.countries,d.regions])buckets[0].observations=0;
  for(const s of Object.values(d.signals)){s.falseCount=0;s.unknownCount=0;s.denominatorObservations=0;}
  assert.equal(validateOutput("overview",d,registries),true);
});
test("real distribution overflow is deterministic and never merged into UNKNOWN",()=>{
  const catalog=Object.fromEntries(Array.from({length:100},(_,i)=>["source"+i,"VALUE_"+String(i).padStart(3,"0")]));
  const r={...registries,catalogs:{networkType:catalog}};
  const values=[...Object.values(catalog),null,undefined,"unreviewed"];
  const buckets=distributionBuckets("networkType",values,r);
  assert.equal(buckets.length,100);assert.deepEqual(buckets.slice(-2),[{kind:"OTHER",value:null,observations:2},{kind:"UNKNOWN",value:null,observations:3}]);
  assert.equal(buckets.reduce((n,b)=>n+b.observations,0),103);
  assert.deepEqual(distributionBuckets("networkType",values.slice().reverse(),r),buckets);
});
test("unreferenced contradictory evidence cannot bypass output validation",()=>{
  reject("detail",d=>{d.current.evidence.push({...d.current.evidence[0],id:"e3",field:"proxy",value:true});});
});
test("credential-shaped cursor strings are rejected rather than serialized",()=>{
  reject("list",d=>{d.page.nextCursor="sk_live_synthetic";d.page.hasMore=true;});
});
