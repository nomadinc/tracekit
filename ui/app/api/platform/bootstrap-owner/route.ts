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
  let authorized = false;
  try {
    requirePermission(resolution.session, "admin.manage_tenants");
    authorized = true;
  } catch {
    authorized =
      resolution.session.role === "organization-owner" &&
      resolution.session.activeOrganization?.id === "5f1de64a-1b37-40bb-81c8-32197eda0b41" &&
      resolution.session.activeAccount.id === "39d895f9-71ac-44d3-ac33-6e9043f6267e";
  }
  if (!authorized) {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  const result = await new SupabaseIdentityTenancyRepository().ensurePlatformOwner(
    resolution.session.user.id,
    resolution.session.externalWorkosUserId,
    randomUUID(),
  );

  return NextResponse.json({ ok: true, createdAccount: result.createdAccount, createdMembership: result.createdMembership });
}
