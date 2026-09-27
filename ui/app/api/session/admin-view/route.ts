import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { ADMIN_VIEW_COOKIE, sealAdminView } from "@/lib/identity/admin-view-cookie";

const MAX_AGE = 60 * 60 * 8;

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  try {
    requirePermission(resolution.session, "admin.impersonate");
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { organizationId?: unknown } | null;
  if (typeof body?.organizationId !== "string")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const repository = new SupabaseIdentityTenancyRepository();
  const organizations = await repository.allActiveOrganizations();
  const organization = organizations.find((candidate) => candidate.id === body.organizationId);
  if (!organization)
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const jar = await cookies();
  jar.set(
    ADMIN_VIEW_COOKIE,
    sealAdminView({
      userId: resolution.session.user.id,
      organizationId: organization.id,
      expiresAt: Date.now() + MAX_AGE * 1000,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
    },
  );

  await repository.recordAuditEvent({
    actorUserId: resolution.session.user.id,
    authenticatedIdentityId: resolution.session.externalWorkosUserId,
    accountId: resolution.session.activeAccount.id,
    organizationId: organization.id,
    action: "admin.client_view.entered",
    targetType: "organization",
    targetId: organization.id,
    result: "success",
    permissionEvaluated: "admin.impersonate",
    correlationId: randomUUID(),
  });

  return NextResponse.json({ organizationId: organization.id });
}

export async function DELETE() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const jar = await cookies();
  jar.delete(ADMIN_VIEW_COOKIE);

  const repository = new SupabaseIdentityTenancyRepository();
  await repository.recordAuditEvent({
    actorUserId: resolution.session.user.id,
    authenticatedIdentityId: resolution.session.externalWorkosUserId,
    accountId: resolution.session.activeAccount.id,
    organizationId: resolution.session.activeOrganization?.id || null,
    action: "admin.client_view.exited",
    result: "success",
    permissionEvaluated: "admin.impersonate",
    correlationId: randomUUID(),
  });

  return NextResponse.json({ ok: true });
}
