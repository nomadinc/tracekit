import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePersistedPlatformAccess } from "@/lib/identity/platform-catalog-access";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { ADMIN_VIEW_COOKIE, sealAdminView } from "@/lib/identity/admin-view-cookie";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

const MAX_AGE = 60 * 60 * 8;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request verification failed." }, { status: 403 });
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const repository = new SupabaseIdentityTenancyRepository();
  try {
    await requirePersistedPlatformAccess(resolution.session, repository, "admin.impersonate");
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { organizationId?: unknown } | null;
  if (typeof body?.organizationId !== "string")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

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

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request verification failed." }, { status: 403 });
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated")
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const repository = new SupabaseIdentityTenancyRepository();
  try {
    await requirePersistedPlatformAccess(resolution.session, repository, "admin.impersonate");
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  const jar = await cookies();
  jar.delete(ADMIN_VIEW_COOKIE);

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
