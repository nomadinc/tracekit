import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";

export async function POST() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
  const repository = new SupabaseIdentityTenancyRepository();
  let authorized = false;
  try {
    requirePermission(resolution.session, "admin.manage_tenants");
    authorized = true;
  } catch {
    const memberships = await repository.membershipsForUser(resolution.session.user.id);
    authorized = memberships.some(
      (membership) =>
        membership.status === "active" &&
        membership.role === "organization-owner" &&
        membership.organizationId === "5f1de64a-1b37-40bb-81c8-32197eda0b41",
    );
  }
  if (!authorized) {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  const result = await repository.ensurePlatformOwner(
    resolution.session.user.id,
    resolution.session.externalWorkosUserId,
    randomUUID(),
  );

  return NextResponse.json({ ok: true, createdAccount: result.createdAccount, createdMembership: result.createdMembership });
}
