import type { Availability,ConfidenceDTO,DistributionBucketDTO,EvidenceDTO,EvidenceRefsDTO,NetworkDTO,ScalarDTO,SignalDTO,SnapshotDTO } from "./dtos";
import { boundedJSON,EMPTY_REGISTRIES,ERRORS,FIELDS,FRESHNESS,member,NetworkDataUnavailable,observationId,record,revision,safeString,scalarValue,SCALARS,SIGNALS,SOURCES,STAGES,STATUS,timestamp,version,type Registries } from "./contracts";
import { validateSnapshot } from "./output-validation";

/** Called only after composite organization/tenant/observation authorization.
 * This pure projection is not a persistence reader or authorization substitute. */
export interface ProjectionContext {receivedAt:string;previousRevisionReceived:boolean}
function confidence(v:unknown,r:Registries):ConfidenceDTO|null {
  if(!record(v)||!member(["SOURCE_REPORTED","EDGE_DERIVED","OBSERVATION_QUALITY"] as const,v.basis)||typeof v.value!=="number"||!Number.isFinite(v.value)||v.value<0||v.value>1)return null;
  if(Object.keys(v).some(k=>!["basis","value","derivationVersion"].includes(k)))return null;
  const dv=version(v.derivationVersion,r)?v.derivationVersion:null;
  if(v.basis==="SOURCE_REPORTED")return {basis:v.basis,value:v.value,derivationVersion:dv};
  return dv?{basis:v.basis,value:v.value,derivationVersion:dv}:null;
}
function value(field:string,v:unknown,r:Registries):string|number|boolean|null {
  if(member(SIGNALS,field))return typeof v==="boolean"?v:null;
  if(field==="asn"){
    const n=typeof v==="string"&&/^[1-9]\d{0,9}$/.test(v)?Number(v):v;
    return scalarValue(field,n,r)?n as number:null;
  }
  if(field==="country")return scalarValue(field,v,r)?v as string:null;
  if(!member(["organization","networkType","carrier","region"] as const,field)||!safeString(v,128))return null;
  const catalog=r.catalogs[field];
  const key=catalog&&Object.hasOwn(catalog,v)?catalog[v]:null;
  return scalarValue(field,key,r)?key:null;
}
function provider(v:string):EvidenceDTO["provider"] {
  switch(v){case "tracekit":return "TRACEKIT";case "ipinfo_plus":return "IPINFO_PLUS";case "ipinfo_residential_proxy":return "IPINFO_RESIDENTIAL_PROXY";case "spur":return "SPUR";default:return "OTHER";}
}
function unknown(availability:Availability,conflictCode:SignalDTO["conflictCode"]="NONE"):SignalDTO {
  return {availability,state:"UNKNOWN",freshness:"UNKNOWN",conflictCode,confidence:null};
}
export function projectSnapshot(source:unknown,context:ProjectionContext,r:Registries=EMPTY_REGISTRIES):SnapshotDTO {
  try{return project(source,context,r);}catch{throw new NetworkDataUnavailable();}
}
function project(source:unknown,context:ProjectionContext,r:Registries):SnapshotDTO {
  if(!boundedJSON(source)||!record(source)||!observationId(source.observationId)||!revision(source.revision)||source.schemaVersion!=="1.0"||!timestamp(source.observedAt)||!timestamp(source.updatedAt)||!timestamp(context.receivedAt)||!member(STATUS,source.status)||typeof context.previousRevisionReceived!=="boolean")throw new NetworkDataUnavailable();
  if(!Array.isArray(source.evidence)||source.evidence.length>128||!Array.isArray(source.conflicts)||source.conflicts.length>128||!Array.isArray(source.errors)||source.errors.length>64)throw new NetworkDataUnavailable();
  const stageArray=(v:unknown)=>{if(!Array.isArray(v)||v.length>8||!v.every(x=>member(STAGES,x))||new Set(v).size!==v.length)throw new NetworkDataUnavailable();return v as SnapshotDTO["completedStages"];};
  const completedStages=stageArray(source.completedStages),pendingStages=stageArray(source.pendingStages);
  const originalIds=new Set<string>();const duplicateIds=new Set<string>();
  for(const e of source.evidence){if(record(e)&&typeof e.id==="string"){if(originalIds.has(e.id))duplicateIds.add(e.id);originalIds.add(e.id);}}
  const evidence:EvidenceDTO[]=[];const bySourceId=new Map<string,EvidenceDTO>();
  for(const e of source.evidence){
    if(!record(e)||typeof e.id!=="string"||!/^evidence_[A-Za-z0-9_-]{1,128}$/.test(e.id)||duplicateIds.has(e.id)||e.domain!=="NETWORK"||!member(FIELDS,e.field)||typeof e.provider!=="string"||!e.provider.length||!member(SOURCES,e.sourceClass)||!member(FRESHNESS,e.freshness)||!timestamp(e.observedAt))continue;
    if(e.sourceObservedAt!==undefined&&!timestamp(e.sourceObservedAt)||e.snapshotAt!==undefined&&!timestamp(e.snapshotAt))continue;
    const mapped=value(e.field,e.value,r);if(mapped===null)continue;
    // Only construct allowlisted fields. Source extensions are never copied.
    const safe={id:"e"+(evidence.length+1),provider:provider(e.provider),sourceClass:e.sourceClass,observedAt:e.observedAt,sourceObservedAt:e.sourceObservedAt??null,snapshotAt:e.snapshotAt??null,freshness:e.freshness,confidence:confidence(e.confidence,r),field:e.field,value:mapped} as EvidenceDTO;
    evidence.push(safe);bySourceId.set(e.id,safe);
  }
  const networkSource=record(source.intelligence)&&record(source.intelligence.network)?source.intelligence.network:{};
  const refs=Object.fromEntries(FIELDS.map(f=>[f,[]])) as unknown as EvidenceRefsDTO;
  const sourceConflicts=source.conflicts;
  const conflicts=new Map<string,Record<string,unknown>>();
  for(const c of sourceConflicts){if(record(c)&&typeof c.id==="string"&&member(FIELDS,c.field))conflicts.set(c.id,c);}
  function assertion(field:typeof FIELDS[number]):SignalDTO|ScalarDTO<string|number> {
    const a=networkSource[field];let result:SignalDTO=unknown("ABSENT");let mapped:string|number|boolean|null=null;
    if(a!==undefined){
      if(!record(a))result=unknown("INVALID");
      else {
        const expected=member(SIGNALS,field)?["TRUE","FALSE","UNKNOWN"]:["KNOWN","UNKNOWN"];
        if(!member(expected,a.state)||!member(FRESHNESS,a.freshness)||!Array.isArray(a.evidenceRefs)||a.evidenceRefs.length>128||new Set(a.evidenceRefs).size!==a.evidenceRefs.length)result=unknown("INVALID");
        else {
          const linked=a.evidenceRefs.map(id=>typeof id==="string"?bySourceId.get(id):undefined);
          const broken=linked.some(e=>!e||e.field!==field);
          const linkedSafe=linked.filter((e):e is EvidenceDTO=>!!e&&e.field===field);
          refs[field]=linkedSafe.map(e=>e.id);
          const fieldEvidence=evidence.filter(e=>e.field===field);
          const values=new Set(fieldEvidence.map(e=>JSON.stringify(e.value)));
          const cr=a.conflictRefs;
          const invalidConflict=cr!==undefined&&(!Array.isArray(cr)||cr.length>128||cr.some(id=>typeof id!=="string"||conflicts.get(id)?.field!==field));
          const declared=sourceConflicts.some(c=>record(c)&&c.field===field)||(Array.isArray(cr)&&cr.length>0);
          if(invalidConflict)result=unknown("CONFLICTING","INVALID_CONFLICT_REFERENCE");
          else if(declared||values.size>1)result=unknown("CONFLICTING","SOURCE_CONFLICT");
          else if(broken)result=unknown("INVALID");
          else if(a.state==="UNKNOWN")result=unknown("EXPLICIT_UNKNOWN");
          else {
            mapped=member(SIGNALS,field)?a.state==="TRUE":value(field,a.value,r);
            if(mapped===null)result=unknown("UNSUPPORTED");
            else if(!linkedSafe.length)result=unknown("INVALID");
            else if(linkedSafe.some(e=>e.value!==mapped))result=unknown("CONFLICTING","ASSERTION_EVIDENCE_MISMATCH");
            else result={availability:"PRESENT",state:member(SIGNALS,field)?a.state as "TRUE"|"FALSE":"UNKNOWN",freshness:a.freshness,conflictCode:"NONE",confidence:confidence(a.confidence,r)};
          }
        }
      }
    }
    if(member(SIGNALS,field))return result;
    return {...result,state:result.availability==="PRESENT"?"KNOWN":"UNKNOWN",value:result.availability==="PRESENT"?mapped as string|number:null} as ScalarDTO<string|number>;
  }
  const network=Object.fromEntries(SCALARS.map(f=>[f,assertion(f)])) as unknown as NetworkDTO;
  network.signals=Object.fromEntries(SIGNALS.map(f=>[f,assertion(f)])) as NetworkDTO["signals"];
  const errors:SnapshotDTO["errors"]=[];
  for(const e of source.errors){
    if(record(e)&&member(STAGES,e.stage)&&member(ERRORS,e.code)){
      const safe={stage:e.stage,code:e.code,retryable:typeof e.retryable==="boolean"?e.retryable:null};
      if(!errors.some(x=>x.stage===safe.stage&&x.code===safe.code&&x.retryable===safe.retryable))errors.push(safe);
    }
  }
  const result:SnapshotDTO={summary:{observationId:source.observationId,revision:source.revision,observedAt:source.observedAt,sourceUpdatedAt:source.updatedAt,receivedAt:context.receivedAt,status:source.status,network},previousRevision:source.previousRevision===undefined?null:source.previousRevision as number,previousRevisionReceived:context.previousRevisionReceived,completedAt:source.completedAt===undefined?null:source.completedAt as string,completedStages,pendingStages,schemaVersion:"1.0",semanticsVersion:version(source.semanticsVersion,r)?source.semanticsVersion:null,derivationRuleVersion:version(source.derivationRuleVersion,r)?source.derivationRuleVersion:null,evidence,evidenceReferences:refs,errors};
  if(!validateSnapshot(result,r))throw new NetworkDataUnavailable();return result;
}

/** For already scoped, projected observations. Invalid/unavailable values are
 * UNKNOWN; valid values beyond the top 98 are OTHER. Never truncate counts. */
export function distributionBuckets(field:"networkType"|"country"|"region",values:readonly unknown[],r:Registries=EMPTY_REGISTRIES):DistributionBucketDTO<string>[] {
  if(values.length>10000)throw new NetworkDataUnavailable();
  const counts=new Map<string,number>();let unknownCount=0;
  for(const v of values){if(typeof v!=="string"||!scalarValue(field,v,r)){unknownCount++;continue;}counts.set(v,(counts.get(v)??0)+1);}
  const sorted=Array.from(counts.entries()).sort(([ak,av],[bk,bv])=>bv-av||(ak<bk?-1:ak>bk?1:0));
  const buckets:DistributionBucketDTO<string>[]=sorted.slice(0,98).map(([v,n])=>({kind:"VALUE",value:v,observations:n}));
  buckets.push({kind:"OTHER",value:null,observations:sorted.slice(98).reduce((total,[,n])=>total+n,0)},{kind:"UNKNOWN",value:null,observations:unknownCount});
  return buckets;
}
