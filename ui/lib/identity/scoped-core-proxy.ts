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
export const scopedCoreGet = proxy.scopedCoreGet;
export const scopedCorePost = proxy.scopedCorePost;
