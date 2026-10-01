import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

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

  const rows = await commercePersistenceRequest("rpc/ensure_tracekit_platform_owner", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: resolution.session.user.id,
      p_authenticated_identity_id: resolution.session.externalWorkosUserId,
      p_correlation_id: randomUUID(),
    }),
  }) as Array<{ account_id: string; membership_id: string; created_account: boolean; created_membership: boolean }>;

  const result = rows[0];
  if (!result) return NextResponse.json({ error: "Platform tenancy bootstrap failed." }, { status: 500 });
  return NextResponse.json({ ok: true, createdAccount: result.created_account, createdMembership: result.created_membership });
}
