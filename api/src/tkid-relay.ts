import { sha256, TkidError } from "./tkid.ts";

export const TKID_RELAY_SCHEMA_VERSION=1;
export const TKID_RELAY_TTL_SECONDS=90*60;
export const TKID_RELAY_COOKIE_PREFIX="__Host-tkid_relay_";
export type RelayState="issued"|"outbound"|"returned"|"handoff_issued"|"consumed"|"expired"|"failed"|"erased";
export type RelayFlowStatus="draft"|"ready"|"enabled"|"paused";
export type RelayFlow={id:string;organizationId:string;businessContextId:string;sourceId:string;flowKey:string;status:RelayFlowStatus;sourceOriginId:string;sourceOrigin:string;checkoutDestination:string;returnOriginId:string;returnOrigin:string;ttlSeconds:number};

const flowKey=/^[a-z0-9][a-z0-9_-]{2,63}$/;
const opaque=/^[A-Za-z0-9_-]{32,128}$/;
export function relayHost(value:string,production=true){const u=new URL(value);if(u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw new TkidError("invalid_relay_host","Relay host must be an exact origin.");if(production&&u.protocol!=="https:")throw new TkidError("invalid_relay_host","Production relay host requires HTTPS.");if(!production&&!['http:','https:'].includes(u.protocol))throw new TkidError("invalid_relay_host","Relay host scheme is unsupported.");return u.origin}
export function configuredCheckout(value:string,allowedHosts:string[]){const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.hash||!allowedHosts.map(x=>x.toLowerCase()).includes(u.hostname.toLowerCase()))throw new TkidError("invalid_checkout_destination","Checkout destination is not approved.");return u.toString()}
export function validateRelayFlow(flow:RelayFlow){if(!flowKey.test(flow.flowKey)||flow.ttlSeconds<1800||flow.ttlSeconds>7200)throw new TkidError("invalid_relay_flow","Relay flow configuration is invalid.");return flow}
export function requireEnabledFlow(flow:RelayFlow){validateRelayFlow(flow);if(flow.status!=="enabled")throw new TkidError("relay_flow_disabled","Relay flow is unavailable.",404);return flow}
export function relayCookieName(flowKeyValue:string,secure=true){if(!flowKey.test(flowKeyValue))throw new TkidError("invalid_relay_flow","Relay flow is unavailable.");return`${secure?TKID_RELAY_COOKIE_PREFIX:"tkid_relay_"}${flowKeyValue}`}
export function relayCookie(flowKeyValue:string,value:string,ttlSeconds:number,secure=true){if(!opaque.test(value))throw new TkidError("invalid_continuity","Continuity reference is invalid.");return`${relayCookieName(flowKeyValue,secure)}=${value}; Max-Age=${Math.min(7200,Math.max(1,ttlSeconds))}; Path=/; HttpOnly; SameSite=Lax${secure?"; Secure":""}`}
export function clearRelayCookie(flowKeyValue:string,secure=true){return`${relayCookieName(flowKeyValue,secure)}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure?"; Secure":""}`}
export function parseRelayCookie(header:string|null,flowKeyValue:string,secure=true){const names=new Set([relayCookieName(flowKeyValue,secure),relayCookieName(flowKeyValue,!secure)]);for(const item of(header||"").split(";")){const [key,...rest]=item.trim().split("=");if(names.has(key)&&opaque.test(rest.join("=")))return rest.join("=")}return null}
export async function continuityDigest(value:string){if(!opaque.test(value))throw new TkidError("invalid_continuity","Continuity reference is invalid.");return sha256(value)}
export function safeRedirect(destination:string){const u=new URL(destination);u.search="";u.hash="";return u.toString()}
export function destinationWithHandoff(origin:string,token:string){const u=new URL(origin);if(u.pathname!=="/"||u.search||u.hash||!opaqueToken(token))throw new TkidError("invalid_handoff","Destination handoff is invalid.");u.pathname="/";u.searchParams.set("tkid_handoff",token);return u.toString()}
function opaqueToken(value:string){return value.length>=64&&value.length<=4096&&/^[A-Za-z0-9_.-]+$/.test(value)}
export function relaySecurityHeaders(){return{"cache-control":"no-store, private","referrer-policy":"no-referrer","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'","strict-transport-security":"max-age=31536000; includeSubDomains"}}
export function relayFailure(code:"cookie_missing"|"expired"|"state_conflict"|"handoff_failed"|"storage_failed"){return{state:"failed" as const,evidence:"continuity_broken" as const,code,checkoutBlocked:false}}
export function relayEvidence(name:"checkout_handoff_started"|"external_checkout_returned"|"cross_domain_handoff_issued"|"cross_domain_handoff_consumed"|"continuity_broken",at:string){return{event_name:name,occurred_at:at,state:"observed" as const}}
