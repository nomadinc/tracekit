import { createSupabaseServerFetch } from './supabase-server-fetch';
import { createClient } from '@supabase/supabase-js';
import { adminAuthError, type AdminAuthEnv } from './admin-auth';
import { getCustomerDetail, getCustomerJourneyDetail, listCustomerOrders, listCustomers, normalizeCustomerListParams, normalizeCustomerJourneyDetailParams } from './customer-explorer';

type PreviewEnv = AdminAuthEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
const ORGANIZATION = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
const TABLES = new Set(['people','person_identifiers','identity_resolution_events','journeys','tracekit_customer_order_read_model','journey_attribution_credits','affiliate_commissions','work_items','journey_events','commerce_order_lines','commerce_relationship_projection_v3']);
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-tracekit-runtime': 'ws023-readonly-preview' } });
}
export function previewDatabaseFetch(base: string, transport: typeof fetch): typeof fetch {
  const origin = new URL(base).origin;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);
    if (request.method !== 'GET' || url.origin !== origin || path.length !== 3 || path[0] !== 'rest' || path[1] !== 'v1' || !TABLES.has(path[2])) throw new Error('Preview database operation denied.');
    return transport(request);
  };
}
export function createPreviewHandler(database: (env: PreviewEnv) => any) {
  return async (request: Request, env: PreviewEnv) => {
    if (request.method !== 'GET') return response({error:'read_only'},405);
    const auth = adminAuthError(request, env);
    if (auth) return auth;
    const url = new URL(request.url);
    if (url.searchParams.getAll('workspace_id').length !== 1 || url.searchParams.get('workspace_id') !== ORGANIZATION) return response({error:'unavailable'},404);
    const context = url.searchParams.get('business_context_id');
    if (context && !/^[a-zA-Z0-9_-]+$/.test(context)) return response({error:'unavailable'},404);
    try {
      const db = database(env);
      if (url.pathname === "/v1/customers") return response(await listCustomers(db,normalizeCustomerListParams(Object.fromEntries(url.searchParams))));
      if (url.pathname === '/v1/customer-orders') return response(await listCustomerOrders(db,{workspace_id:ORGANIZATION,offset:Number(url.searchParams.get('offset')||0),limit:Number(url.searchParams.get('limit')||50),order_id:url.searchParams.get('order_id')||undefined,business_context_id:context}));
      const route = /^\/v1\/customers\/([a-f0-9-]{36})(?:\/journeys\/([a-f0-9-]{36}))?$/.exec(url.pathname);
      if (!route) return response({error:'unavailable'},404);
      if (route[2]) return response(await getCustomerJourneyDetail(db,{...normalizeCustomerJourneyDetailParams({workspace_id:ORGANIZATION,person_id:route[1],journey_id:route[2],limit:url.searchParams.get('limit'),cursor:url.searchParams.get('cursor')}),business_context_id:context}));
      return response(await getCustomerDetail(db,{workspace_id:ORGANIZATION,person_id:route[1],business_context_id:context,journey_id:url.searchParams.get('journey_id')}));
    } catch { return response({error:'unavailable'},404); }
  };
}
// No scheduled, queue, write, webhook or installation entry point is exported.
export default {fetch:createPreviewHandler(env => createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createSupabaseServerFetch(env.SUPABASE_SERVICE_ROLE_KEY,previewDatabaseFetch(env.SUPABASE_URL,fetch))}}))};
