import { createHash } from "node:crypto";
import { boundedJSON,NetworkDataUnavailable,observationId,record,timestamp } from "./contracts";

export const NETWORK_PERMISSION="network_intelligence.view" as const;
export class NetworkAuthorizationDenied extends Error {
  readonly code="RESOURCE_UNAVAILABLE";readonly status=404;
  constructor(){super("The requested resource is unavailable.");}
}
interface Effective {status:"active"|"inactive";validFrom:string;expiresAt:string}
export type PermissionScope =
  | {kind:"ORGANIZATION";organizationId:string}
  | {kind:"WORKSPACE";organizationId:string;workspaceId:string;ownershipVerified:boolean}
  | {kind:"OBSERVATION";organizationId:string;observationId:string;ownershipVerified:boolean};
export interface PermissionDecision {capability:string;effect:"allow"|"deny";scope:PermissionScope}
/** WS-001 must issue this from authoritative persistence, never browser claims.
 * Versions must change atomically on all underlying authorization changes. */
export interface AuthoritativeSnapshot {
  identity:{kind:"persistent";userId:string;status:"active"|"inactive";sessionId:string};
  account:{id:string;status:"active"|"inactive"};
  organization:{id:string;status:"active"|"inactive"};
  membership:Effective & {id:string;userId:string;organizationId:string;accountId:string};
  decisions:PermissionDecision[];
  entitlement:Effective & {id:string;subjectUserId:string;membershipId:string;organizationId:string;permission:typeof NETWORK_PERMISSION;scopeKind:"ORGANIZATION";workspaceId:null;revokedAt:string|null;approvedTenantSetVersion:string};
  tenantSet:{version:string;organizationId:string;completeOrganizationCoverage:boolean;tenants:Array<{tenantRef:string;organizationId:string;status:"active"|"inactive";bindingEpoch:string}>};
  versions:{identity:string;account:string;organization:string;membership:string;permissions:string;entitlement:string;tenantBindings:string;workspaceMappings:string};
  /** Admin views do not bypass any of the above requirements. */
  adminClientView:boolean;
}
export interface AuthoritativeProvider {
  /** Atomic, current server-side snapshot for the request's persistent session. */
  load():Promise<AuthoritativeSnapshot|null>;
  /** WS-001 must compare against current active authoritative bindings AND the
   * approved tenant-set epochs, under the snapshot versions. Missing, revoked,
   * stale, mismatched or ambiguous evidence must return false. Never self-attest
   * by comparing the supplied snapshot to itself. */
  verifyBindingEpochs(snapshot:AuthoritativeSnapshot):Promise<boolean>;
}
export const UNAVAILABLE_PROVIDER:AuthoritativeProvider=Object.freeze({load:async()=>null,verifyBindingEpochs:async()=>false});
export interface AuthorizedReadScope {organizationId:string;tenantRefs:readonly string[];authorizationVersion:string}
const id=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
// Canonical lowercase hyphenated UUID text; do not normalize caller values.
const bindingEpoch=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=="00000000-0000-0000-0000-000000000000";
const keys=(v:unknown,expected:string[])=>record(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
function effective(v:Effective,now:number){return v.status==="active"&&timestamp(v.validFrom)&&timestamp(v.expiresAt)&&Date.parse(v.validFrom)<=now&&now<Date.parse(v.expiresAt);}
function fingerprint(s:AuthoritativeSnapshot){return createHash("sha256").update(JSON.stringify(s)).digest("hex");}
function checked(raw:unknown,now:number):AuthoritativeSnapshot {
  const deny=()=>{throw new NetworkAuthorizationDenied();};
  if(!boundedJSON(raw,65536)||!keys(raw,["identity","account","organization","membership","decisions","entitlement","tenantSet","versions","adminClientView"]))return deny();
  const s=structuredClone(raw) as AuthoritativeSnapshot;
  if(!keys(s.identity,["kind","userId","status","sessionId"])||s.identity.kind!=="persistent"||s.identity.status!=="active"||!id(s.identity.userId)||!id(s.identity.sessionId))return deny();
  if(!keys(s.account,["id","status"])||!id(s.account.id)||s.account.status!=="active"||!keys(s.organization,["id","status"])||!id(s.organization.id)||s.organization.status!=="active"||typeof s.adminClientView!=="boolean")return deny();
  const m=s.membership;
  if(!keys(m,["id","userId","organizationId","accountId","status","validFrom","expiresAt"])||!id(m.id)||!effective(m,now)||m.userId!==s.identity.userId||m.organizationId!==s.organization.id||m.accountId!==s.account.id)return deny();
  const e=s.entitlement;
  if(!keys(e,["id","subjectUserId","membershipId","organizationId","permission","scopeKind","workspaceId","revokedAt","approvedTenantSetVersion","status","validFrom","expiresAt"])||!id(e.id)||!effective(e,now)||Date.parse(e.expiresAt)-Date.parse(e.validFrom)>30*86400000||e.revokedAt!==null||e.subjectUserId!==m.userId||e.membershipId!==m.id||e.organizationId!==m.organizationId||e.permission!==NETWORK_PERMISSION||e.scopeKind!=="ORGANIZATION"||e.workspaceId!==null)return deny();
  if(!keys(s.versions,["identity","account","organization","membership","permissions","entitlement","tenantBindings","workspaceMappings"])||!Object.values(s.versions).every(id))return deny();
  const ts=s.tenantSet;
  if(!keys(ts,["version","organizationId","completeOrganizationCoverage","tenants"])||!id(ts.version)||ts.version!==e.approvedTenantSetVersion||ts.organizationId!==s.organization.id||ts.completeOrganizationCoverage!==true||!Array.isArray(ts.tenants)||!ts.tenants.length||ts.tenants.length>256)return deny();
  if(!ts.tenants.every(t=>keys(t,["tenantRef","organizationId","status","bindingEpoch"])&&typeof t.tenantRef==="string"&&/^tenant_[A-Za-z0-9_-]{8,128}$/.test(t.tenantRef)&&t.organizationId===s.organization.id&&t.status==="active"&&bindingEpoch(t.bindingEpoch))||new Set(ts.tenants.map(t=>t.tenantRef)).size!==ts.tenants.length)return deny();
  if(!Array.isArray(s.decisions)||s.decisions.length>256)return deny();let granted=false;
  for(const d of s.decisions){
    if(!keys(d,["capability","effect","scope"])||!id(d.capability.replace(/\./g,"_"))||!["allow","deny"].includes(d.effect)||!record(d.scope)||!id(d.scope.organizationId))return deny();
    const sc=d.scope;
    if(sc.kind==="ORGANIZATION"){if(!keys(sc,["kind","organizationId"]))return deny();}
    else if(sc.kind==="WORKSPACE"){if(!keys(sc,["kind","organizationId","workspaceId","ownershipVerified"])||!id(sc.workspaceId)||typeof sc.ownershipVerified!=="boolean")return deny();}
    else if(sc.kind==="OBSERVATION"){if(!keys(sc,["kind","organizationId","observationId","ownershipVerified"])||!observationId(sc.observationId)||typeof sc.ownershipVerified!=="boolean")return deny();}
    else return deny();
    if(d.capability!==NETWORK_PERMISSION||sc.organizationId!==s.organization.id)continue;
    if(sc.kind!=="ORGANIZATION"&&sc.ownershipVerified!==true)return deny();
    // V1 organization reads deny on ANY relevant narrower deny, never partial totals.
    if(d.effect==="deny")return deny();
    if(sc.kind==="ORGANIZATION")granted=true;
  }
  if(!granted)return deny();return s;
}
function hints(params:URLSearchParams,s:AuthoritativeSnapshot){
  // Organization-only V1 never interprets workspace selectors as organizations.
  for(const key of ["workspaceId","workspace_id"])if(params.has(key))throw new NetworkAuthorizationDenied();
  const orgKeys=["organization_id","organizationId"];
  for(const key of orgKeys){const values=params.getAll(key);if(values.length>1||values.some(v=>v!==s.organization.id))throw new NetworkAuthorizationDenied();}
  for(const key of ["tenant","tenant_ref","tenantRef","tenant_id","tenantId","business_context_id","businessContextId"])if(params.has(key))throw new NetworkAuthorizationDenied();
}
/** Execute a non-streaming read and revalidate before returning its result.
 * No production provider exists here: the default ALWAYS denies access.
 * Repository/serialization integration is M2B. Final-send race remains. */
export async function withAuthorizedNetworkRead<T>(
  params:URLSearchParams,
  read:(scope:AuthorizedReadScope)=>Promise<T>,
  provider:AuthoritativeProvider=UNAVAILABLE_PROVIDER,
  now:()=>number=Date.now,
):Promise<T> {
  let initial:AuthoritativeSnapshot;
  try{initial=checked(await provider.load(),now());hints(params,initial);if(await provider.verifyBindingEpochs(structuredClone(initial))!==true)throw new NetworkAuthorizationDenied();}catch{throw new NetworkAuthorizationDenied();}
  const authVersion=fingerprint(initial);
  const scope=Object.freeze({organizationId:initial.organization.id,tenantRefs:Object.freeze(initial.tenantSet.tenants.map(t=>t.tenantRef).sort()),authorizationVersion:authVersion});
  let result:T;
  try{result=await read(scope);}catch{throw new NetworkDataUnavailable();}
  try{const final=checked(await provider.load(),now());hints(params,final);if(await provider.verifyBindingEpochs(structuredClone(final))!==true)throw new NetworkAuthorizationDenied();if(fingerprint(final)!==authVersion)throw new NetworkAuthorizationDenied();}catch{throw new NetworkAuthorizationDenied();}
  return result;
}
