import "server-only";
import { createScopedCoreProxy } from "./scoped-core-runtime";
import { traceKitCoreAdminSecret } from "@/lib/core/admin-credential";

import { resolveApplicationSession } from "@/lib/identity/application-session";

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return traceKitCoreAdminSecret();
}

const proxy = createScopedCoreProxy({ resolveSession: resolveApplicationSession, apiBaseUrl, adminSecret, fetch: (...args) => fetch(...args) });
export const scopedCoreGet: typeof proxy.scopedCoreGet = async (...args) => {
 if(process.env.VERCEL_ENV === "preview" || process.env.TRACEKIT_REPORTING_MODE !== undefined) { if(process.env.TRACEKIT_REPORTING_MODE !== "restricted-staging")return {status:503,body:{error:"reporting_unavailable"}}; const {restrictedStagingGet}=await import("./staging-reporting-proxy");return restrictedStagingGet(args[0],args[1]); }
 return proxy.scopedCoreGet(...args);
};
export const scopedCorePost: typeof proxy.scopedCorePost = async (...args) => { if(process.env.VERCEL_ENV === "preview" || process.env.TRACEKIT_REPORTING_MODE !== undefined)return {status:405,body:{error:"reporting_read_only"}};return proxy.scopedCorePost(...args); };
