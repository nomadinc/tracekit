import { createClient } from '@supabase/supabase-js';
import { createPreviewHandler, previewDatabaseFetch } from '../../../../../api/src/ws023-readonly-handler';
import { createSupabaseServerFetch } from '../../../../../api/src/supabase-server-fetch';
import { traceKitCoreAdminSecret } from '@/lib/core/admin-credential';

// Explicit acceptance runtime, never a fallback to a privileged repository.
// Reuse the exact Core projection and its GET-only database transport.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW !== 'enabled') return Response.json({error:'unavailable'},{status:404});
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (base !== 'https://uoeosoiegatlqtzemsfv.supabase.co' || !key) return Response.json({error:'preview_binding_unavailable'},{status:503});
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api\/ws023-core/,'');
  const handler = createPreviewHandler(() => createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createSupabaseServerFetch(key,previewDatabaseFetch(base,fetch))}}));
  return handler(new Request(url,request),{SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:key,TK_SECRET_KEY:traceKitCoreAdminSecret()});
}
