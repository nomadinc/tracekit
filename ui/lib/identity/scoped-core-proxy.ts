import "server-only";
import { createScopedCoreProxy, type CustomerReadDiagnostic } from "./scoped-core-runtime";
import { customerReadDiagnosticsEnabled } from "./customer-read-diagnostic-policy";
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

const customerReadDiagnostic = customerReadDiagnosticsEnabled({
  VERCEL_ENV: process.env.VERCEL_ENV,
  TRACEKIT_CUSTOMER_READ_DIAGNOSTICS: process.env.TRACEKIT_CUSTOMER_READ_DIAGNOSTICS,
})
  ? (event: CustomerReadDiagnostic) => { console.info("tracekit_customer_read_boundary", JSON.stringify(event)); }
  : undefined;
const proxy = createScopedCoreProxy({ resolveSession: resolveApplicationSession, apiBaseUrl, adminSecret, fetch: (...args) => fetch(...args), customerReadDiagnostic });
export const scopedCoreGet = proxy.scopedCoreGet;
export const scopedCorePost = proxy.scopedCorePost;
