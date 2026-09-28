import "server-only";

import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import type { Permission } from "@/lib/identity/permissions";

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 400) };
  }
}

export async function scopedCoreGet(
  upstreamPath: string,
  requestUrl: string,
  permission: Permission,
) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
    return { status: 404, body: { error: "The requested resource is unavailable." } };
  }
  try {
    requirePermission(resolution.session, permission);
  } catch {
    return { status: 404, body: { error: "The requested resource is unavailable." } };
  }

  const secret = adminSecret();
  if (!secret) {
    return { status: 500, body: { ok: false, error: "admin_auth_not_configured", message: "TraceKit Core authentication is unavailable." } };
  }

  const incoming = new URL(requestUrl);
  const params = new URLSearchParams(incoming.searchParams);
  // Tenant scope is authoritative from the authenticated TraceKit session.
  // Browser-supplied workspace_id is never forwarded.
  params.set("workspace_id", resolution.session.activeOrganization.id);
  const query = params.toString();

  const res = await fetch(`${apiBaseUrl()}${upstreamPath}${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json", "x-tk-secret": secret },
  });
  return { status: res.status, body: await readJsonSafe(res) };
}
