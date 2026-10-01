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
  try {
    requirePermission(resolution.session, "admin.manage_tenants");
  } catch {
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
