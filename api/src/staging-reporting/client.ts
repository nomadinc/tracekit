// Isolated reporting transport. No integration, identity-sync or mutation client.
export const PROJECT = 'joahiwgidfbzwzyslrbq';
const ORIGIN = `https://${PROJECT}.supabase.co`;
export class ReportingDenied extends Error { status:number; constructor(status = 403) { super('reporting_unavailable'); this.status=status; } }
export type Claims = { iss:string;aud:string;purpose?:string;sub:string;organization_id:string;workspace_id:string;permissions:string[];membership_version:string;role:string;exp:number;iat:number };
export type Projection = { relation:string;columns:readonly string[];financial:boolean;permission:string;organizationColumn:string;workspaceColumn:string };
export type Manifest = Readonly<Record<string,Projection>>;
export type Ports = { fetch:typeof fetch; now:()=>number; currentMembership:(token:string,claims:Readonly<Claims>)=>Promise<{active:boolean;subject:string;organization:string;workspace:string;version:string;permissions:readonly string[]}> };
export type Config = { origin:string;publishableKey:string;issuer:string;publicJwk:JsonWebKey & {kid?:string} };
const roles = ['tk_stg_reporting_reader','tk_stg_financial_reader'];
const id = (x:unknown):x is string => typeof x==='string' && /^[A-Za-z0-9_-]{1,160}$/.test(x);
function deny():never { throw new ReportingDenied(); }
function decode(x:string):Uint8Array<ArrayBuffer> { if(!/^[A-Za-z0-9_-]+$/.test(x))return deny();try { const b=Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')!==x)return deny();return b; } catch {return deny();} }
export function createReportingClient(config:Config,manifest:Manifest,ports:Ports) {
 if(config.origin!==ORIGIN || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey) || !config.issuer || config.publicJwk.kty!=='OKP' || config.publicJwk.crv!=='Ed25519' || config.publicJwk.d)throw new ReportingDenied(503);
 const pinned=JSON.parse(JSON.stringify(config)) as Config;
 const registry=JSON.parse(JSON.stringify(manifest)) as Record<string,Projection>;
 for(const [name,p] of Object.entries(registry)) {
  if(!id(name)|| !/^[a-z][a-z0-9_]*$/.test(p.relation)||!p.columns.length||new Set(p.columns).size!==p.columns.length||p.columns.some(c=>!/^[a-z][a-z0-9_]*$/.test(c))||!p.columns.includes(p.organizationColumn)||!p.columns.includes(p.workspaceColumn)||typeof p.financial!=='boolean'||!p.permission)throw new ReportingDenied(503);
 }
 async function claims(token:string):Promise<Claims> {
  if(typeof token!=='string'||token.length>12000)return deny();const parts=token.split('.');if(parts.length!==3)return deny();
  let h:any,c:any;try{h=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[0])));c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[1])));}catch{return deny();}
  if(JSON.stringify(h)!==new TextDecoder().decode(decode(parts[0]))||JSON.stringify(c)!==new TextDecoder().decode(decode(parts[1])))return deny();
  if((pinned.publicJwk.kid?h.kid!==pinned.publicJwk.kid:h.kid!==undefined))return deny();
  if(h.alg!=='EdDSA'||h.typ!=='JWT'||Object.keys(h).some(k=>!['alg','typ','kid'].includes(k)))return deny();
  const key=await crypto.subtle.importKey('jwk',pinned.publicJwk,{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return deny();
  const now=ports.now();if(c.iss!==pinned.issuer||c.aud!=='authenticated'||c.purpose!=='tracekit-staging-reporting'||!id(c.sub)||!id(c.organization_id)||!id(c.workspace_id)||!id(c.membership_version)||!roles.includes(c.role)||!Array.isArray(c.permissions)||c.permissions.some((p:unknown)=>typeof p!=='string')||new Set(c.permissions).size!==c.permissions.length||!Number.isSafeInteger(c.exp)||!Number.isSafeInteger(c.iat)||c.iat>now||c.exp<=now||c.exp-c.iat>60)return deny();
  return c as Claims;
 }
 async function authority(token:string,c:Claims,financial:boolean,permission:string) {
  if(ports.now()<c.iat||ports.now()>=c.exp)return deny();
  let m;try{m=await ports.currentMembership(token,Object.freeze({...c,permissions:Object.freeze([...c.permissions]) as unknown as string[]}));}catch{return deny();}
  if(!m||m.active!==true||m.subject!==c.sub||m.organization!==c.organization_id||m.workspace!==c.workspace_id||m.version!==c.membership_version||!Array.isArray(m.permissions)||!c.permissions.every(p=>m.permissions.includes(p))||!m.permissions.includes(permission)||!c.permissions.includes(permission))return deny();
  if(financial && (c.role!=='tk_stg_financial_reader'||!['financials.view','orders.view_financials'].every(p=>m.permissions.includes(p)&&c.permissions.includes(p))))return deny();
  if(ports.now()<c.iat||ports.now()>=c.exp)return deny();
 }
 const authorized=new WeakSet<object>();
 return Object.freeze({authenticate:claims,async authorize(token:string,requested:{organization:string;workspace:string},permissions:readonly string[]) { const c=await claims(token);if(c.organization_id!==requested.organization||c.workspace_id!==requested.workspace||c.organization_id!==c.workspace_id)return deny();for(const permission of permissions)await authority(token,c,permissions.includes("financials.view"),permission);const value=Object.freeze({...c,permissions:Object.freeze([...c.permissions]) as unknown as string[]});authorized.add(value);return value; },async revalidate(token:string,c:Claims,permissions:readonly string[]) {if(!authorized.has(c))return deny();for(const permission of permissions)await authority(token,c,permissions.includes("financials.view"),permission);},async read(token:string,operation:string,requested:{organization:string;workspace:string}) {
  const p=Object.hasOwn(registry,operation)?registry[operation]:undefined;if(!p)return deny();const c=await claims(token);
  if(requested.organization!==c.organization_id||requested.workspace!==c.workspace_id)return deny();
  await authority(token,c,p.financial,p.permission);
  const url=new URL(`${pinned.origin}/rest/v1/${p.relation}`);url.searchParams.set('select',p.columns.join(','));url.searchParams.set(p.organizationColumn,`eq.${c.organization_id}`);url.searchParams.set(p.workspaceColumn,`eq.${c.workspace_id}`);url.searchParams.set('limit','100');
  let response:Response;try{response=await ports.fetch(url,{method:'GET',redirect:'error',cache:'no-store',headers:{apikey:pinned.publishableKey,authorization:`Bearer ${token}`,accept:'application/json'}});}catch{throw new ReportingDenied(503);}
  if(!response.ok)throw new ReportingDenied(response.status===401||response.status===403?403:503);
  const text=await response.text();if(text.length>1_000_000)throw new ReportingDenied(503);
  let rows;try{rows=JSON.parse(text);}catch{throw new ReportingDenied(503);}
  if(!Array.isArray(rows)||rows.length>100)return deny();
  const output=rows.map((row:any)=>{if(!row||typeof row!=='object'||Array.isArray(row)||row[p.organizationColumn]!==c.organization_id||row[p.workspaceColumn]!==c.workspace_id)return deny();if(p.columns.some(k=>typeof row[k]==='object'&&row[k]!==null))return deny();return Object.fromEntries(p.columns.map(k=>[k,row[k]??null]));});
  await authority(token,c,p.financial,p.permission);return output;
 }});
}
