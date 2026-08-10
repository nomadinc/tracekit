import { sha256, TkidError } from "./tkid.ts";

export const TKID_ORIGIN_ROLES=["frontend","checkout_return","oto","confirmation","multi_purpose"] as const;
export const TKID_ORIGIN_STATES=["pending","verified","active","retired"] as const;
export type TkidOriginRole=typeof TKID_ORIGIN_ROLES[number];
export type TkidOriginState=typeof TKID_ORIGIN_STATES[number];
export type TkidManagedOrigin={id:string;organizationId:string;businessContextId:string;sourceId:string;canonicalOrigin:string;role:TkidOriginRole;lifecycleStatus:TkidOriginState;verificationState:"unissued"|"issued"|"verified"|"failed"|"expired";verifiedAt:string|null;retiredAt:string|null};

export function canonicalizeTkidOrigin(input:string,options:{allowLocalHttp?:boolean}={}){
  if(typeof input!=="string"||input.length>255||input.includes("*"))throw new TkidError("invalid_origin","Enter an exact HTTPS origin.",400);
  let url:URL;try{url=new URL(input)}catch{throw new TkidError("invalid_origin","Enter a valid exact origin.",400)}
  const local=options.allowLocalHttp&&url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(url.protocol!=="https:"&&!local)throw new TkidError("https_required","Production origins require HTTPS.",400);
  if(url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new TkidError("exact_origin_required","Origins cannot contain credentials, paths, query strings, or fragments.",400);
  if(!url.hostname||url.hostname.includes("_")||url.hostname.startsWith(".")||url.hostname.endsWith("."))throw new TkidError("invalid_origin","Enter a valid exact origin.",400);
  return url.origin.toLowerCase();
}

export function verificationRecordName(canonicalOrigin:string){return `_tracekit.${new URL(canonicalOrigin).hostname}`}
export async function issueOriginVerification(canonicalOrigin:string,randomBytes:Uint8Array){
  if(randomBytes.byteLength<24)throw new Error("verification entropy must be at least 192 bits");
  const token=Array.from(randomBytes,b=>b.toString(16).padStart(2,"0")).join("");
  return{method:"dns_txt" as const,recordName:verificationRecordName(canonicalOrigin),recordValue:`tracekit-origin-verification=${token}`,tokenDigest:await sha256(token),tokenHint:token.slice(-8),expiresAt:new Date(Date.now()+24*60*60_000).toISOString()};
}
export async function verificationMatches(recordValues:string[],presentedToken:string,expectedDigest:string){return recordValues.includes(`tracekit-origin-verification=${presentedToken}`)&&await sha256(presentedToken)===expectedDigest}

const transitions:Record<TkidOriginState,TkidOriginState[]>={pending:["verified"],verified:["active"],active:["retired"],retired:["active"]};
export function assertOriginTransition(origin:TkidManagedOrigin,next:TkidOriginState){
  if(!transitions[origin.lifecycleStatus].includes(next))throw new TkidError("invalid_origin_transition","Origin lifecycle transition is not allowed.",409);
  if((next==="active"||origin.lifecycleStatus==="retired")&&(!origin.verifiedAt||origin.verificationState!=="verified"))throw new TkidError("origin_verification_required","Verify origin control before activation.",409);
  return true;
}
export function originReadiness(origins:Array<Pick<TkidManagedOrigin,"lifecycleStatus"|"verificationState">>){
  if(origins.some(o=>o.lifecycleStatus==="active"))return{ready:true,blockers:[] as string[]};
  if(origins.some(o=>o.lifecycleStatus==="verified"))return{ready:false,blockers:["ORIGIN_PENDING_ACTIVATION"]};
  if(origins.some(o=>o.verificationState==="issued"||o.lifecycleStatus==="pending"))return{ready:false,blockers:["ORIGIN_VERIFICATION_REQUIRED"]};
  return{ready:false,blockers:["NO_ACTIVE_ORIGIN"]};
}
export function safeOriginAudit(action:string,origin:TkidManagedOrigin){return{action,targetType:"tkid_source_origin",targetId:origin.id,metadata:{origin:origin.canonicalOrigin,role:origin.role,lifecycleStatus:origin.lifecycleStatus,sourceId:origin.sourceId}}}
