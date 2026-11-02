import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { authorizeOrganizationSwitch } from "@/lib/identity/organization-switching";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization } from "@/lib/identity/active-organization-cookie";
import { ACTIVE_BUSINESS_CONTEXT_COOKIE } from "@/lib/identity/active-business-context-cookie";

import { restrictedIdentityBoundary } from "@/lib/identity/staging-session-boundary";
import { resolveReadOnlyStagingSession } from "@/lib/identity/staging-read-only-session";
import { withAuth } from "@workos-inc/authkit-nextjs";

export async function POST(request: Request) {
  if (restrictedIdentityBoundary({ VERCEL_ENV: process.env.VERCEL_ENV, TRACEKIT_REPORTING_MODE: process.env.TRACEKIT_REPORTING_MODE })) {
    if (request.headers.get("origin") !== "https://staging.trace-kit.io") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
    const body = await request.json().catch(() => null);
    if (typeof body?.organizationId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(body.organizationId)) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
    const selected = await resolveReadOnlyStagingSession({ authenticate: withAuth, cookieJar: cookies, fetch, organizationId: body.organizationId });
    if (selected.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
    const jar = await cookies();
    jar.delete(ACTIVE_BUSINESS_CONTEXT_COOKIE);
    jar.set(ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization({ userId: selected.session.user.id, organizationId: body.organizationId, expiresAt: Date.now() + 60 * 60 * 24 * 30 * 1000 }), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return NextResponse.json({ organizationId: body.organizationId, normalizeBusinessContext: true, clearInvestigationState: true });
  }
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const body = await request.json().catch(() => null) as { organizationId?: unknown } | null;
  if (typeof body?.organizationId !== "string") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  try {
    const result = await authorizeOrganizationSwitch(resolution.session, body.organizationId, new SupabaseIdentityTenancyRepository());
    const jar = await cookies();
    jar.delete(ACTIVE_BUSINESS_CONTEXT_COOKIE);
    jar.set(ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization({ userId: resolution.session.user.id, organizationId: result.organization.id, expiresAt: Date.now() + 60 * 60 * 24 * 30 * 1000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return NextResponse.json({ organizationId: result.organization.id, normalizeBusinessContext: true, clearInvestigationState: true });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
