import "server-only";
import { createScopedCoreProxy, type CustomerReadDiagnostic } from "./scoped-core-runtime";
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

export function customerReadDiagnosticsEnabled(env: Pick<NodeJS.ProcessEnv, "VERCEL_ENV" | "TRACEKIT_CUSTOMER_READ_DIAGNOSTICS"> = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.TRACEKIT_CUSTOMER_READ_DIAGNOSTICS === "enabled";
}

const customerReadDiagnostic = customerReadDiagnosticsEnabled()
  ? (event: CustomerReadDiagnostic) => { console.info("tracekit_customer_read_boundary", JSON.stringify(event)); }
  : undefined;
const proxy = createScopedCoreProxy({ resolveSession: resolveApplicationSession, apiBaseUrl, adminSecret, fetch: (...args) => fetch(...args), customerReadDiagnostic });
export const scopedCoreGet = proxy.scopedCoreGet;
export const scopedCorePost = proxy.scopedCorePost;
