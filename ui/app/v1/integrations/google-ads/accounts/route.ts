import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { listGoogleDiscoveredAccounts, selectGoogleAccounts } from "@/lib/integrations/google-ads-persistence";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) {
    return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable." }, { status: 404 });
  }
  const connectionId = request.nextUrl.searchParams.get("connectionId") || "";
  if (!connectionId) return NextResponse.json({ ok: false, code: "connection_required" }, { status: 400 });
  const accounts = await listGoogleDiscoveredAccounts({ organizationId: resolution.session.activeOrganization.id, connectionId });
  return NextResponse.json({ ok: true, accounts: accounts.filter((account) => account.status === "active" && account.eligibleForSpendSync && !account.isManager) });
}

export async function POST(request: NextRequest) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) {
    return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable." }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as { connectionId?: unknown; accountIds?: unknown } | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
  const accountIds = Array.isArray(body?.accountIds) ? body.accountIds.filter((id): id is string => typeof id === "string") : [];
  if (!connectionId || !accountIds.length) return NextResponse.json({ ok: false, code: "invalid_selection", message: "Select at least one Google Ads account." }, { status: 400 });
  try {
    const accounts = await selectGoogleAccounts({ organizationId: resolution.session.activeOrganization.id, connectionId, selectedAccountIds: accountIds });
    return NextResponse.json({ ok: true, selected: accounts.filter((account) => account.selectedForSync).length });
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_selection", message: "One or more Google Ads accounts are unavailable." }, { status: 400 });
  }
}
