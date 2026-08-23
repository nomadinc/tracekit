import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";

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

async function customerPathFromContext(context: any) {
  const params = await context?.params;
  const parts = Array.isArray(params?.customerPath) ? params.customerPath : [];
  return parts.map((part: string) => encodeURIComponent(part)).join("/");
}

async function customerExplorerFetch(pathAndQuery: string) {
  const secret = adminSecret();
  if (!secret) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "admin_auth_not_configured",
        message: "TK_SECRET_KEY is required on the UI server for Customer Explorer requests.",
      },
    };
  }
  const res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-tk-secret": secret,
    },
  });
  return { status: res.status, body: await readJsonSafe(res) };
}

export async function GET(req: Request, context: any) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
  try {
    requirePermission(resolution.session, "customers.view");
    const organizationId = resolution.session.activeOrganization?.id;
    if (!organizationId) throw new Error("customer_scope_unavailable");

    const path = await customerPathFromContext(context);
    if (!path) return NextResponse.json({ ok: false, error: "bad_request", message: "customer path is required." }, { status: 400 });
    const url = new URL(req.url);
    url.searchParams.delete("workspace_id");
    url.searchParams.delete("workspaceId");
    url.searchParams.set("workspace_id", organizationId);
    const search = url.searchParams.toString();
    const result = await customerExplorerFetch(`/v1/customers/${path}?${search}`);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
