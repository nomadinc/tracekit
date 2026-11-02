import {completeRead,readProof} from './completeness.ts';
import { ROLE_PERMISSIONS, PERMISSIONS, type Role, type Permission } from '../../../ui/lib/identity/permissions.ts';
import { ReportingDenied, PROJECT } from './client.ts';

export const SESSION_COLUMNS = {
 tracekit_users: 'id,workos_user_id,primary_email,display_name,status',
 tracekit_memberships: 'id,user_id,account_id,organization_id,role_id,status,effective_from,effective_until',
 tracekit_roles: 'id,role_key',
 tracekit_accounts: 'id,account_type,name,status',
 tracekit_organizations: 'id,owning_account_id,name,status',
 tracekit_permission_overrides: 'id,membership_id,capability,effect,organization_id,resource_type,resource_id',
 tracekit_business_context_access: 'membership_id,organization_id,business_context_id,status',
 tracekit_business_contexts: 'id,organization_id,name,status',
} as const;
type Row = Record<string, unknown>;
type Table = keyof typeof SESSION_COLUMNS;
type Registry = { subject: string; application_user_id: string; organization_id: string; workspace_id: string; version: string; permissions: string[]; active: boolean; valid_until: string };
type Env = { SESSION_READER_TOKEN?: string; REPORTING_PUBLISHABLE_KEY: string; REPORTING_ISSUER: string };
const readPermissions = ['organizations.view','offers.view','customers.view','customers.view_sensitive_data','orders.view','orders.view_financials','financials.view'];
const id = (value: unknown): string => {
 if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new ReportingDenied();
 return value;
};
const label = (value: unknown): string => {
 if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new ReportingDenied();
 return value;
};
function exactly(rows: Row[], key: string, value: string) {
 const selected = rows.filter(row => row[key] === value);
 if (selected.length !== 1) throw new ReportingDenied();
 return selected[0];
}
function unique(rows: Row[], key = 'id') {
 if (new Set(rows.map(row => id(row[key]))).size !== rows.length) throw new ReportingDenied();
 return rows;
}

// Separate credential, separate fixed projection: never use the reporting,
// registry-administrator, service-role or PostgreSQL-owner credential here.
export function createPageSessionReader(env: Env, transport: typeof fetch, now = () => Math.floor(Date.now()/1000)) {
 return async function read(table: Table, filters: Record<string, string>): Promise<Row[]> {
  if (!Object.prototype.hasOwnProperty.call(SESSION_COLUMNS,table)) throw new ReportingDenied(503);
  if (!env.SESSION_READER_TOKEN || !env.REPORTING_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw new ReportingDenied(503);
  let expiry=0;
  try {
   const payload = JSON.parse(atob((env.SESSION_READER_TOKEN.split('.')[1] || '').replace(/-/g,'+').replace(/_/g,'/')));
   if (payload.role !== 'tk_stg_session_reader' || payload.iss !== env.REPORTING_ISSUER
    || payload.aud !== 'authenticated' || payload.purpose !== 'tracekit-staging-session-reader'
    || !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat)
    || payload.exp <= now() || payload.iat > now() || payload.exp-payload.iat < 1 || payload.exp-payload.iat > 300) throw new ReportingDenied(503);
   expiry=payload.exp;
  } catch { throw new ReportingDenied(503); }
  const url = new URL(`https://${PROJECT}.supabase.co/rest/v1/${table}`);
  url.searchParams.set('select', SESSION_COLUMNS[table]); url.searchParams.set('limit', '51');
  const filterKey=table==='tracekit_users'?'workos_user_id':table==='tracekit_memberships'?'user_id':['tracekit_permission_overrides','tracekit_business_context_access'].includes(table)?'membership_id':'id';
  if(Object.keys(filters).length!==1||!Object.hasOwn(filters,filterKey)||typeof filters[filterKey]!=='string'||!/^eq\.[A-Za-z0-9_-]{1,160}$|^in\.\([A-Za-z0-9_-]{1,160}(,[A-Za-z0-9_-]{1,160}){0,49}\)$/.test(filters[filterKey]))throw new ReportingDenied();
  for (const [key,value] of Object.entries(filters)) url.searchParams.set(key,value);
  url.searchParams.set('order', table === 'tracekit_business_context_access' ? 'membership_id.asc,business_context_id.asc' : 'id.asc');
  const response = await transport(url, { method:'GET', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(5000),
   headers:{ apikey:env.REPORTING_PUBLISHABLE_KEY, authorization:`Bearer ${env.SESSION_READER_TOKEN}`, 'accept-profile':'public',prefer:'count=exact' } });
  const rows=await completeRead(response,table,'tk_stg_session_reader',50);if(expiry<=now())throw new ReportingDenied(503);return rows;
 };
}

export async function resolvePageSession(
 subject: string, selected: string | null, tokenExpires: number,
 read: ReturnType<typeof createPageSessionReader>,
 registry: (subject:string, organization:string, workspace:string) => Promise<Registry>, now: () => number,
) {
 id(subject); if (selected !== null) id(selected);
 const receipts:any[]=[];let collection=0;const checkedRead=async(table:Table,filters:Record<string,string>)=>{const rows=await read(table,filters);receipts.push({...readProof(rows,table),collection});return rows;};
 const collect = async () => {
  const users = unique(await checkedRead('tracekit_users',{workos_user_id:`eq.${subject}`}));
  if (users.length !== 1 || users[0].workos_user_id !== subject || users[0].status !== 'active') throw new ReportingDenied();
  const user = users[0], userId = id(user.id);
  const memberships = unique(await checkedRead('tracekit_memberships',{user_id:`eq.${userId}`}));
  if (memberships.some(m => m.user_id !== userId)) throw new ReportingDenied();
  const current = memberships.filter(m => m.status === 'active' && Number.isFinite(Date.parse(String(m.effective_from)))
   && Date.parse(String(m.effective_from)) <= now()*1000
   && (m.effective_until === null || Number.isFinite(Date.parse(String(m.effective_until))) && Date.parse(String(m.effective_until)) > now()*1000)
   && m.organization_id !== null && m.account_id !== null);
  if (!current.length) throw new ReportingDenied();
  const list = (key:string) => `in.(${Array.from(new Set(current.map(m => id(m[key])))).join(',')})`;
  const roles = unique(await checkedRead('tracekit_roles',{id:list('role_id')}));
  const accounts = unique(await checkedRead('tracekit_accounts',{id:list('account_id')}));
  const organizations = unique(await checkedRead('tracekit_organizations',{id:list('organization_id')}));
  const overrides = unique(await checkedRead('tracekit_permission_overrides',{membership_id:list('id')}));
  if (overrides.some(o => !current.some(m => m.id === o.membership_id))) throw new ReportingDenied();
  const access = await checkedRead('tracekit_business_context_access',{membership_id:list('id')});
  if (access.some(a => !current.some(m => m.id === a.membership_id && m.organization_id === a.organization_id))) throw new ReportingDenied();
  const activeAccess = access.filter(a => a.status === 'active');
  if (!activeAccess.length) throw new ReportingDenied();
  if (new Set(activeAccess.map(a => `${id(a.membership_id)}:${id(a.business_context_id)}`)).size !== activeAccess.length) throw new ReportingDenied();
  const contexts = unique(await checkedRead('tracekit_business_contexts', {id:`in.(${Array.from(new Set(activeAccess.map(a => id(a.business_context_id)))).join(',')})` }));
  const entries = [];
  for (const m of current) {
   const account = exactly(accounts,'id',id(m.account_id)), organization = exactly(organizations,'id',id(m.organization_id));
   if (account.status !== 'active' || organization.status !== 'active') continue;
   if (organization.owning_account_id !== account.id || !['client','agency'].includes(String(account.account_type))) throw new ReportingDenied();
   const role = exactly(roles,'id',id(m.role_id)).role_key as Role;
   if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS,role) || ['platform-owner','platform-admin','support','billing','read-only-operations'].includes(role)) throw new ReportingDenied();
   const ownOverrides = overrides.filter(o => o.membership_id === m.id);
   const overrideKeys=ownOverrides.map(o=>JSON.stringify([o.membership_id,o.organization_id,o.resource_type,o.resource_id,o.capability]));if(new Set(overrideKeys).size!==overrideKeys.length)throw new ReportingDenied();
   // Scoped overrides need an explicit resource contract; never widen them to a global grant.
   if (ownOverrides.some(o => typeof o.capability!=='string'||!(PERMISSIONS as readonly string[]).includes(o.capability)||o.organization_id !== null && o.organization_id !== organization.id
    || o.resource_type !== null || o.resource_id !== null || !['allow','deny'].includes(String(o.effect)))) throw new ReportingDenied();
   const effective = new Set<string>(ROLE_PERMISSIONS[role]);
   for (const o of ownOverrides) if (o.effect === 'allow') effective.add(String(o.capability));
   for (const o of ownOverrides) if (o.effect === 'deny') effective.delete(String(o.capability));
   let r: Registry;
   r = await registry(subject,id(organization.id),id(organization.id));
   receipts.push({...readProof(r,'current_memberships'),collection});
   if (r.subject !== subject || r.application_user_id !== userId || r.organization_id !== organization.id
    || r.workspace_id !== organization.id || r.active !== true || !r.version || !Array.isArray(r.permissions)
    || !Number.isFinite(Date.parse(r.valid_until)) || Date.parse(r.valid_until) <= now()*1000) throw new ReportingDenied();
   const permissions = readPermissions.filter(p => effective.has(p) && r.permissions.includes(p)) as Permission[];
   if (!permissions.includes('customers.view')) continue;
   const businessContexts = activeAccess.filter(a => a.membership_id === m.id).map(a => {
    const c = exactly(contexts,'id',id(a.business_context_id));
    if (c.organization_id !== organization.id) throw new ReportingDenied();
    return c;
   }).filter(c => c.status === 'active').map(c => ({id:id(c.id), organizationId:id(organization.id), name:label(c.name), mark:label(c.name).slice(0,2).toUpperCase()}));
   if (!businessContexts.length) continue;
   entries.push({ m, account, organization, role, permissions, r, businessContexts });
  }
  if (!entries.length || new Set(entries.map(e => e.organization.id)).size !== entries.length) throw new ReportingDenied();
  return {user,entries};
 };
 // Exact-count receipts establish bounded read completeness. Re-reading is only
 // an additional drift check, never evidence that a truncated set is complete.
 // Changes during bootstrap
 // fail instead of serializing a mixed membership/account/permission snapshot.
 const first = await collect();collection=1;const second = await collect();
 if (JSON.stringify(first) !== JSON.stringify(second)) throw new ReportingDenied();
 const {user,entries} = second;
 const chosen = selected ? entries.find(e => e.organization.id === selected) : entries[0];
 if (!chosen) throw new ReportingDenied();
 const {m,account,organization,role,permissions,r,businessContexts} = chosen;
 const issuedAt = now()*1000, expiresAt = Math.min(issuedAt+45_000,tokenExpires*1000,Date.parse(r.valid_until),m.effective_until===null?Infinity:Date.parse(String(m.effective_until)));
 if (expiresAt <= issuedAt) throw new ReportingDenied();
 return { authorityEvidence:{version:1,kind:'exact-count-authority-v1',readCount:receipts.length,reads:receipts},version:1, subject, membershipVersion:r.version, issuedAt, expiresAt, workspaceId:id(organization.id),
  user:{id:id(user.id),workosUserId:subject,primaryEmail:label(user.primary_email),displayName:label(user.display_name),status:'active'},
  account:{id:id(account.id),name:label(account.name),accountType:account.account_type,status:'active'},
  organization:{id:id(organization.id),accountId:id(account.id),name:label(organization.name),mark:label(organization.name).slice(0,2).toUpperCase(),status:'active'},
  membership:{id:id(m.id),userId:id(user.id),accountId:id(account.id),organizationId:id(organization.id),role,status:'active',effectiveFrom:m.effective_from,effectiveUntil:m.effective_until},
  permissions,businessContexts,activeBusinessContextId:businessContexts[0].id,
  availableOrganizations:entries.map(e=>({id:id(e.organization.id),accountId:id(e.account.id),name:label(e.organization.name),mark:label(e.organization.name).slice(0,2).toUpperCase(),status:'active'})),
 };
}
