import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { TENANT_HINT_KEYS } from "@/lib/identity/operational-tenant-boundary";
import { queryGovernedActionNotifications } from "@/lib/mcp/action-notifications";

const allowed = new Set(["status", "severity", "search", "limit", "cursor"]);
const unavailable = () => NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (TENANT_HINT_KEYS.some((key) => url.searchParams.has(key)) || Array.from(url.searchParams.keys()).some((key) => !allowed.has(key))) return unavailable();
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return unavailable();
    requirePermission(resolution.session, "organizations.view");
    const page = await queryGovernedActionNotifications(resolution.session.activeOrganization.id, {
      status: url.searchParams.get("status"), severity: url.searchParams.get("severity"), search: url.searchParams.get("search"),
      limit: Number(url.searchParams.get("limit") || 50), cursor: Number(url.searchParams.get("cursor") || 0),
    });
    return NextResponse.json({ ok: true, workspace_id: resolution.session.activeOrganization.id, ...page }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "governed_notification_source_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
