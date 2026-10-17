import type { NetworkDTOs } from "./dtos";
import { boundedJSON,count,EMPTY_REGISTRIES,ERRORS,FIELDS,FRESHNESS,MAX_BYTES,member,NetworkDataUnavailable,observationId,PROVIDERS,record,revision,safeString,scalarValue,SIGNALS,SOURCES,STAGES,STATUS,timestamp,version,type Registries } from "./contracts";

type Schema=(v:unknown)=>boolean;
const literal=(expected:unknown):Schema=>v=>v===expected;
const enumeration=(values:readonly string[]):Schema=>v=>member(values,v);
const nullable=(s:Schema):Schema=>v=>v===null||s(v);
const bool:Schema=v=>typeof v==="boolean";
const integer=(min:number,max:number):Schema=>v=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
function array(s:Schema,max:number,unique=false):Schema{return v=>Array.isArray(v)&&v.length<=max&&v.every(s)&&(!unique||new Set(v.map(x=>JSON.stringify(x))).size===v.length);}
function object(shape:Record<string,Schema>,check?:(v:Record<string,unknown>)=>boolean):Schema {
  return v=>record(v)&&Object.keys(v).length===Object.keys(shape).length&&Object.keys(v).every(k=>Object.hasOwn(shape,k))&&Object.entries(shape).every(([k,s])=>Object.hasOwn(v,k)&&s(v[k]))&&(!check||check(v));
}
function keyed(keys:readonly string[],s:Schema):Schema{return object(Object.fromEntries(keys.map(k=>[k,s])));}
function sum(v:unknown):number{return Object.values(v as Record<string,number>).reduce((a,b)=>a+b,0);}
const localId:Schema=v=>typeof v==="string"&&/^e(?:[1-9]|[1-9]\d|1[01]\d|12[0-8])$/.test(v);
const scope=object({kind:literal("ORGANIZATION"),workspaceId:literal(null)});
const sampling=object({population:literal("RECEIVED_OBSERVATIONS"),historicalSamplingRate:literal(null),estimatedVisitors:literal(null),disclosureCode:literal("RECEIVED_OBSERVATIONS_NOT_TOTAL_TRAFFIC")});
const page=object({limit:integer(1,100),nextCursor:nullable(v=>safeString(v,1024)&&/^[A-Za-z0-9_-]{1,1024}$/.test(v)),hasMore:bool},v=>v.hasMore===(v.nextCursor!==null));
const context=object({generatedAt:timestamp,snapshotAt:timestamp,scope,from:timestamp,toExclusive:timestamp,timeBasis:literal("OBSERVED_AT"),countBasis:literal("DISTINCT_OBSERVATIONS_CURRENT_RECEIVED_REVISION"),sampling},v=>{
  const duration=Date.parse(v.toExclusive as string)-Date.parse(v.from as string);
  return duration>0&&duration<=31*86400000&&Date.parse(v.snapshotAt as string)<=Date.parse(v.generatedAt as string);
});
const conflict=enumeration(["NONE","SOURCE_CONFLICT","ASSERTION_EVIDENCE_MISMATCH","INVALID_CONFLICT_REFERENCE"]);
const availability=enumeration(["PRESENT","ABSENT","INVALID","EXPLICIT_UNKNOWN","CONFLICTING","UNSUPPORTED"]);

function schemas(r:Registries){
  const approved:Schema=v=>version(v,r);
  const confidence=object({basis:enumeration(["SOURCE_REPORTED","EDGE_DERIVED","OBSERVATION_QUALITY"]),value:v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1,derivationVersion:nullable(approved)},v=>v.basis==="SOURCE_REPORTED"||v.derivationVersion!==null);
  const meta={availability,freshness:enumeration(FRESHNESS),conflictCode:conflict,confidence:nullable(confidence)};
  const assertionInvariant=(v:Record<string,unknown>)=>{
    if((v.availability==="CONFLICTING")!==(v.conflictCode!=="NONE"))return false;
    if(v.availability!=="PRESENT")return v.state==="UNKNOWN"&&v.confidence===null;
    return v.state!=="UNKNOWN"&&v.conflictCode==="NONE";
  };
  const signal=object({...meta,state:enumeration(["TRUE","FALSE","UNKNOWN"])},assertionInvariant);
  const scalar=(field:string)=>object({...meta,state:enumeration(["KNOWN","UNKNOWN"]),value:nullable(v=>scalarValue(field,v,r))},v=>assertionInvariant(v)&&(v.state==="KNOWN"?v.value!==null:v.value===null));
  const network=object({asn:scalar("asn"),organization:scalar("organization"),networkType:scalar("networkType"),carrier:scalar("carrier"),country:scalar("country"),region:scalar("region"),signals:keyed(SIGNALS,signal)});
  const summary=object({observationId,revision,observedAt:timestamp,sourceUpdatedAt:timestamp,receivedAt:timestamp,status:enumeration(STATUS),network},v=>Date.parse(v.observedAt as string)<=Date.parse(v.sourceUpdatedAt as string));
  const evidence=object({id:localId,provider:enumeration(PROVIDERS),sourceClass:enumeration(SOURCES),observedAt:timestamp,sourceObservedAt:nullable(timestamp),snapshotAt:nullable(timestamp),freshness:enumeration(FRESHNESS),confidence:nullable(confidence),field:enumeration(FIELDS),value:v=>typeof v==="boolean"||typeof v==="string"||typeof v==="number"},v=>member(SIGNALS,v.field)?bool(v.value):scalarValue(v.field as string,v.value,r));
  const error=object({stage:enumeration(STAGES),code:enumeration(ERRORS),retryable:nullable(bool)});
  const snapshot=object({summary,previousRevision:nullable(revision),previousRevisionReceived:bool,completedAt:nullable(timestamp),completedStages:array(enumeration(STAGES),8,true),pendingStages:array(enumeration(STAGES),8,true),schemaVersion:literal("1.0"),semanticsVersion:nullable(approved),derivationRuleVersion:nullable(approved),evidence:array(evidence,128),evidenceReferences:keyed(FIELDS,array(localId,128,true)),errors:array(error,64,true)},v=>{
    const s=v.summary as Record<string,unknown>,n=s.network as Record<string,unknown>;
    if(s.revision===1?(v.previousRevision!==null||v.previousRevisionReceived):(v.previousRevision!==Number(s.revision)-1))return false;
    if(v.completedAt!==null&&Date.parse(v.completedAt as string)<Date.parse(s.observedAt as string))return false;
    if(v.completedAt!==null&&Date.parse(v.completedAt as string)>Date.parse(s.sourceUpdatedAt as string))return false;
    if((v.completedStages as string[]).some(x=>(v.pendingStages as string[]).includes(x)))return false;
    const es=v.evidence as Array<Record<string,unknown>>;const ids=new Map(es.map(e=>[e.id,e]));
    if(ids.size!==es.length)return false;
    const refs=v.evidenceReferences as Record<string,string[]>;
    return FIELDS.every(field=>{
      if(!refs[field].every(id=>ids.get(id)?.field===field))return false;
      const a=(member(SIGNALS,field)?(n.signals as Record<string,unknown>)[field]:n[field]) as Record<string,unknown>;
      const fieldEvidence=es.filter(e=>e.field===field);
      if(new Set(fieldEvidence.map(e=>JSON.stringify(e.value))).size>1&&a.availability!=="CONFLICTING")return false;
      if(a.availability!=="PRESENT")return true;
      const expected=member(SIGNALS,field)?a.state==="TRUE":a.value;
      return refs[field].length>0&&refs[field].every(id=>ids.get(id)?.value===expected);
    });
  });
  const providerCoverage=object({provider:enumeration(PROVIDERS),observationsWithEvidence:count,denominatorObservations:count},v=>Number(v.observationsWithEvidence)<=Number(v.denominatorObservations));
  const coverage=(v:unknown,total:number)=>Array.isArray(v)&&v.every(x=>(x as Record<string,unknown>).denominatorObservations===total)&&new Set(v.map(x=>(x as Record<string,unknown>).provider)).size===v.length;
  const signalCounts=object({trueCount:count,falseCount:count,unknownCount:count,conflictingCount:count,denominatorObservations:count},v=>Number(v.trueCount)+Number(v.falseCount)+Number(v.unknownCount)===v.denominatorObservations&&Number(v.conflictingCount)<=Number(v.unknownCount));
  const bucket=(field:string)=>object({kind:enumeration(["VALUE","OTHER","UNKNOWN"]),value:nullable(v=>scalarValue(field,v,r)),observations:count},v=>v.kind==="VALUE"?v.value!==null:v.value===null);
  const distribution=(field:string):Schema=>v=>array(bucket(field),100)(v)&&new Set((v as Array<Record<string,unknown>>).map(x=>x.kind==="VALUE"?x.value:x.kind)).size===(v as unknown[]).length&&(v as Array<Record<string,unknown>>).filter(x=>x.kind==="VALUE").length<=98;
  const overview=object({context,observationCount:count,timeline:array(object({from:timestamp,toExclusive:timestamp,observations:count}),366),networkTypes:distribution("networkType"),countries:distribution("country"),regions:distribution("region"),signals:keyed(SIGNALS,signalCounts),providerCoverage:array(providerCoverage,5),statusCounts:keyed(STATUS,count)},v=>{
    const total=Number(v.observationCount),ctx=v.context as Record<string,string>;
    if(sum(v.statusCounts)!==total||!coverage(v.providerCoverage,total))return false;
    if(!Object.values(v.signals as Record<string,Record<string,unknown>>).every(s=>s.denominatorObservations===total))return false;
    if(![v.networkTypes,v.countries,v.regions].every(bs=>(bs as Array<{observations:number}>).reduce((a,b)=>a+b.observations,0)===total))return false;
    const ts=v.timeline as Array<{from:string;toExclusive:string;observations:number}>;
    let end=ctx.from;
    for(const t of ts){if(t.from!==end||t.toExclusive<=t.from||t.toExclusive>ctx.toExclusive)return false;end=t.toExclusive;}
    return (ts.length===0?total===0:end===ctx.toExclusive)&&ts.reduce((a,b)=>a+b.observations,0)===total;
  });
  const list=object({context,observations:array(summary,100),page},v=>{
    const rows=v.observations as Array<Record<string,unknown>>,p=v.page as Record<string,number>,ctx=v.context as Record<string,string>;
    return rows.length<=p.limit&&new Set(rows.map(x=>x.observationId)).size===rows.length&&rows.every(x=>String(x.observedAt)>=ctx.from&&String(x.observedAt)<ctx.toExclusive);
  });
  const common={scope,generatedAt:timestamp,snapshotAt:timestamp,sampling};
  const times=(v:Record<string,unknown>)=>String(v.snapshotAt)<=String(v.generatedAt);
  const detail=object({...common,current:snapshot,revisionHistory:object({receivedRevisions:array(revision,100,true),page},v=>{
    const rows=v.receivedRevisions as number[],p=v.page as Record<string,number>;return rows.length<=p.limit&&rows.every((x,i)=>i===0||rows[i-1]>x);
  })},times);
  const revisionDTO=object({...common,snapshot},times);
  const diagnosticError=object({stage:enumeration(STAGES),code:enumeration(ERRORS),observations:count,retryableTrue:count,retryableFalse:count,retryableUnknown:count},v=>Number(v.retryableTrue)+Number(v.retryableFalse)+Number(v.retryableUnknown)===v.observations);
  const diagnostics=object({context,denominatorObservations:count,statusCounts:keyed(STATUS,count),completedStageCounts:keyed(STAGES,count),pendingStageCounts:keyed(STAGES,count),reportedErrors:array(diagnosticError,40),providerCoverage:array(providerCoverage,5),evidenceFreshness:object({denominatorEvidenceItems:count,counts:keyed(FRESHNESS,count)},v=>sum(v.counts)===v.denominatorEvidenceItems),latestReceivedAt:nullable(timestamp)},v=>{
    const total=Number(v.denominatorObservations);
    const errors=v.reportedErrors as Array<Record<string,unknown>>;
    return sum(v.statusCounts)===total&&coverage(v.providerCoverage,total)&&[v.completedStageCounts,v.pendingStageCounts].every(x=>Object.values(x as Record<string,number>).every(n=>n<=total))&&errors.every(x=>Number(x.observations)<=total)&&new Set(errors.map(x=>x.stage+":"+x.code)).size===errors.length&&Number((v.evidenceFreshness as Record<string,unknown>).denominatorEvidenceItems)<=total*128&&(total===0?v.latestReceivedAt===null:v.latestReceivedAt!==null);
  });
  return {overview,list,detail,revision:revisionDTO,diagnostics,snapshot};
}

/** All failures are value-free, avoiding source/error disclosure. */
export function validateOutput<K extends keyof NetworkDTOs>(kind:K,value:unknown,r:Registries=EMPTY_REGISTRIES):value is NetworkDTOs[K] {
  try{return boundedJSON(value,MAX_BYTES)&&schemas(r)[kind](value);}catch{return false;}
}
export function serializeOutput<K extends keyof NetworkDTOs>(kind:K,value:unknown,r:Registries=EMPTY_REGISTRIES):string {
  if(!validateOutput(kind,value,r))throw new NetworkDataUnavailable();return JSON.stringify(value);
}
export function validateSnapshot(value:unknown,r:Registries):boolean {try{return boundedJSON(value)&&schemas(r).snapshot(value);}catch{return false;}}
