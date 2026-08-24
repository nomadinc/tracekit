import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";

// Temporary restore-environment diagnostic. Remove after agency tenancy certification.
// Rebuild marker: synchronized branch-scoped TK secret.
function hostOf(value: string | undefined) {
  try {
    return value ? new URL(value).host : null;
  } catch {
    return null;
  }
}

function supabaseRef(value: string | undefined) {
  const host = hostOf(value);
  if (!host) return null;
  const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] || null;
}

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    ""
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}

export async function GET() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  try {
    requirePermission(resolution.session, "customers.view");
    const organizationId = resolution.session.activeOrganization?.id;
    if (!organizationId) throw new Error("diagnostic_scope_unavailable");

    const baseUrl = apiBaseUrl();
    const secret = adminSecret();
    let customerStatus: number | null = null;
    let customerCount: number | null = null;

    if (baseUrl && secret) {
      const url = `${baseUrl}/v1/customers?workspace_id=${encodeURIComponent(organizationId)}&limit=1`;
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json", "x-tk-secret": secret },
      });
      customerStatus = response.status;
      const body = await response.json().catch(() => null) as any;
      const candidates = [body?.customers, body?.items, body?.data];
      const rows = candidates.find(Array.isArray);
      customerCount = Array.isArray(rows) ? rows.length : null;
    }

    return NextResponse.json({
      activeOrganizationId: organizationId,
      apiHost: hostOf(baseUrl),
      supabaseHost: hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseProjectRef: supabaseRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
      customerExplorer: {
        configured: Boolean(baseUrl && secret),
        status: customerStatus,
        count: customerCount,
      },
    });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
