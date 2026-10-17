/** No production semantic registry is assumed. Empty registries fail safely. */
import { isIP } from "node:net";
import type { ScalarField, SamplingDTO } from "./dtos";
export const SIGNALS = ["hosting","vpn","proxy","residentialProxy","mobileProxy","tor","anonymous"] as const;
export const SCALARS = ["asn","organization","networkType","carrier","country","region"] as const;
export const FIELDS = [...SCALARS,...SIGNALS] as const;
export const FRESHNESS = ["CURRENT","AGING","STALE","UNKNOWN"] as const;
export const STATUS = ["COMPLETE","PARTIAL","OWNED_ONLY","PROVIDER_UNAVAILABLE","EXPIRED","UNKNOWN"] as const;
export const STAGES = ["OWNED","NETWORK_LOCAL","NETWORK_LIVE","BROWSER","AUTOMATION","BEHAVIORAL","DERIVATION","UNKNOWN"] as const;
export const SOURCES = ["OWNED_AUTHORITATIVE","OWNED_OBSERVATION","LOCAL_SNAPSHOT","LOCAL_STALE","LIVE_PROVIDER","DERIVED","UNKNOWN"] as const;
export const PROVIDERS = ["TRACEKIT","IPINFO_PLUS","IPINFO_RESIDENTIAL_PROXY","SPUR","OTHER"] as const;
export const ERRORS = ["PROVIDER_UNAVAILABLE","SNAPSHOT_UNAVAILABLE","COLLECTION_INCOMPLETE","EXPIRED","UNKNOWN"] as const;
export const MAX_BYTES = 512*1024;
export interface Registries {
  // Server-owned dependency only. Never populate from a request or source payload.
  versions: readonly string[];
  countries: readonly string[];
  /** Exact source value -> reviewed output key. No arbitrary label passthrough. */
  catalogs: Readonly<Partial<Record<Exclude<ScalarField,"asn"|"country">,Readonly<Record<string,string>>>>>;
}
export const EMPTY_REGISTRIES: Registries = Object.freeze({versions:Object.freeze([]),countries:Object.freeze([]),catalogs:Object.freeze({})});
export function member<T extends string>(values:readonly T[], v:unknown):v is T {return typeof v==="string" && (values as readonly string[]).includes(v);}
export function record(v:unknown):v is Record<string,unknown> {return !!v && typeof v==="object" && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));}
export function timestamp(v:unknown):v is string {
  if(typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))return false;
  const n=Date.parse(v);return Number.isFinite(n)&&new Date(n).toISOString()===v;
}
/** Defense in depth, not a substitute for field-specific registries. */
export function safeString(v:unknown,max=128):v is string {
  if(typeof v!=="string"||!v.length||v.length>max||/[\x00-\x1f\x7f]/.test(v))return false;
  let text=v;
  for(let i=0;i<3;i++){try{const next=decodeURIComponent(text);if(next===text)break;text=next;}catch{return false;}}
  if(/(?:\d{1,3}\.){3}\d{1,3}|ipref:|protected.?ip|vaultref|(?:m25\/|provider-observations\/)|ciphertext|SPUR_TOKEN|BEGIN .*PRIVATE KEY|sk_live_|bearer\s|secret|credential|token_hash/i.test(text))return false;
  return !text.split(/[\s\[\](),;]+/).some(part=>isIP(part)!==0 || (part.includes(":") && /[0-9a-f]*:[0-9a-f:]+/i.test(part)));
}
export function observationId(v:unknown):v is string {return safeString(v,132)&&/^obs_[A-Za-z0-9_-]{8,128}$/.test(v);}
export function revision(v:unknown):v is number {return Number.isInteger(v)&&Number(v)>=1&&Number(v)<=2147483647;}
export function count(v:unknown):v is number {return Number.isSafeInteger(v)&&Number(v)>=0;}
export function version(v:unknown,r:Registries):v is string {return safeString(v,64)&&r.versions.includes(v);}
export function scalarValue(field:string,v:unknown,r:Registries):boolean {
  if(field==="asn")return Number.isInteger(v)&&Number(v)>=1&&Number(v)<=4294967295;
  if(field==="country")return typeof v==="string"&&/^[A-Z]{2}$/.test(v)&&r.countries.includes(v);
  if(!member(["organization","networkType","carrier","region"] as const,field))return false;
  return safeString(v,64)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v)&&Object.values(r.catalogs[field]??{}).includes(v);
}
export function sampling():SamplingDTO {return {population:"RECEIVED_OBSERVATIONS",historicalSamplingRate:null,estimatedVisitors:null,disclosureCode:"RECEIVED_OBSERVATIONS_NOT_TOTAL_TRAFFIC"};}
export class NetworkDataUnavailable extends Error {readonly code="DATA_UNAVAILABLE";constructor(){super("Network intelligence data unavailable.");}}
/** Bounded plain JSON inspection prevents cycles/accessors/toJSON and depth bombs. */
export function boundedJSON(value:unknown,maxBytes=MAX_BYTES):boolean {
  let nodes=0,bytes=0;const seen=new Set<object>();
  const visit=(v:unknown,depth:number):boolean=>{
    if(++nodes>50000||depth>16)return false;
    if(v===null||typeof v==="boolean")return true;
    if(typeof v==="number")return Number.isFinite(v);
    if(typeof v==="string"){bytes+=Buffer.byteLength(v,"utf8");return v.length<=8192&&bytes<=maxBytes;}
    if(typeof v!=="object"||seen.has(v))return false;
    seen.add(v);
    if(!Array.isArray(v)&&!record(v))return false;
    const descriptors=Object.getOwnPropertyDescriptors(v);
    if(Reflect.ownKeys(v).some(k=>typeof k!=="string"))return false;
    for(const [k,d] of Object.entries(descriptors)){
      if(Array.isArray(v)&&k==="length")continue;
      bytes+=Buffer.byteLength(k,"utf8");
      if(!d.enumerable||!("value" in d)||!visit(d.value,depth+1)||bytes>maxBytes)return false;
    }
    if(Array.isArray(v)&&Object.keys(v).length!==v.length)return false;
    seen.delete(v);return true;
  };
  if(!visit(value,0))return false;
  try{return Buffer.byteLength(JSON.stringify(value),"utf8")<=maxBytes;}catch{return false;}
}
