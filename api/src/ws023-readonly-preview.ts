import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerFetch } from "./supabase-server-fetch";
import { createPreviewHandler, previewDatabaseFetch } from "./ws023-readonly-handler";
export { createPreviewHandler, previewDatabaseFetch } from "./ws023-readonly-handler";
// Existing platform consumers require a queue callback on every uploaded
// version. Reject every background invocation; never acknowledge or mutate.
export async function rejectPreviewBackgroundWork() { throw new Error("Read-only preview cannot process background work."); }
export default {queue:rejectPreviewBackgroundWork,scheduled:rejectPreviewBackgroundWork,fetch:createPreviewHandler(env => createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createSupabaseServerFetch(env.SUPABASE_SERVICE_ROLE_KEY,previewDatabaseFetch(env.SUPABASE_URL,fetch))}}))};
