import "server-only";
import { createScopedCoreProxy } from "./scoped-core-runtime";
import { traceKitCoreAdminSecret } from "@/lib/core/admin-credential";
import { previewCoreFetch } from "./preview-core-transport";

import { resolveApplicationSession } from "@/lib/identity/application-session";

function apiBaseUrl() {
  if (process.env.VERCEL_ENV === "preview" && process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW === "enabled") {
    const host = process.env.VERCEL_URL;
    if (!host || !/^[a-z0-9.-]+\.vercel\.app$/.test(host)) throw new Error("Preview Core origin is unavailable.");
    return `https://${host}/api/ws023-core`;
  }
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

// Explicit opt-in. Never enable on production without a separate approval.
// Only a fixed, allowlisted diagnostic schema reaches restricted server logs.
const customerReadDiagnostic = process.env.TRACEKIT_CUSTOMER_READ_DIAGNOSTICS === "enabled"
  ? (event: import("./scoped-core-runtime").CustomerReadDiagnostic) => {
      console.info("tracekit_customer_read_boundary", JSON.stringify(event));
    }
  : undefined;
const proxy = createScopedCoreProxy({ resolveSession: resolveApplicationSession, apiBaseUrl, adminSecret, fetch: previewCoreFetch, customerReadDiagnostic });
export const scopedCoreGet = proxy.scopedCoreGet;
export const scopedCorePost = proxy.scopedCorePost;
