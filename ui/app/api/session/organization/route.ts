import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { authorizeOrganizationSwitch } from "@/lib/identity/organization-switching";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization } from "@/lib/identity/active-organization-cookie";

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const body = await request.json().catch(() => null) as { organizationId?: unknown } | null;
  if (typeof body?.organizationId !== "string") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  try {
    const result = await authorizeOrganizationSwitch(resolution.session, body.organizationId, new SupabaseIdentityTenancyRepository());
    const jar = await cookies();
    jar.set(ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization({ userId: resolution.session.user.id, organizationId: result.organization.id, expiresAt: Date.now() + 60 * 60 * 24 * 30 * 1000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return NextResponse.json({ organizationId: result.organization.id, normalizeBusinessContext: true, clearInvestigationState: true });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
