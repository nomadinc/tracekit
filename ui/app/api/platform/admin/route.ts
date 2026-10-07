import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import {
  requirePlatformAdmin,
  requireSameOrigin,
  validateClientInput,
} from "@/lib/platform/admin-policy";
import { assertCanonicalPlatformMembership } from "@/lib/platform/platform-access";
import { adminRpc } from "@/lib/platform/admin-repository";


export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated")
      return NextResponse.json(
        { error: "Resource unavailable." },
        { status: 404 },
      );
    const session = requirePlatformAdmin(resolution.session);
    await assertCanonicalPlatformMembership(session);
    const body = (await request.json()) as Record<string, unknown>;
    const uuid = (value: unknown) =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      );
    if (body.action === "create") {
      requirePlatformAdmin(session, "organizations.manage");
      const input = validateClientInput(body);
      const accountId = await adminRpc(session, "ws021_create_client", {
        p_name: input.name,
        p_type: input.accountType,
      });
      return NextResponse.json({ accountId });
    }
    if (
      !uuid(body.accountId) ||
      (body.organizationId != null && !uuid(body.organizationId))
    )
      return NextResponse.json(
        { error: "Resource unavailable." },
        { status: 404 },
      );
    const accountId = String(body.accountId),
      organizationId =
        body.organizationId == null ? null : String(body.organizationId);
    if (
      ["role", "remove"].includes(String(body.action)) &&
      uuid(body.membershipId)
    ) {
      requirePlatformAdmin(
        session,
        body.action === "remove" ? "users.remove" : "users.manage_permissions",
      );
      await adminRpc(session, "ws021_change_membership", {
        p_account: accountId,
        p_org: organizationId,
        p_membership: body.membershipId,
        p_role: typeof body.role === "string" ? body.role : "",
        p_remove: body.action === "remove",
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Resource unavailable." },
      { status: 404 },
    );
  } catch {
    // Never serialize provider errors (which may contain invitation tokens) or DB internals.
    return NextResponse.json(
      {
        error:
          "Operation unavailable. Check permissions, target status, and final-owner protection.",
      },
      { status: 400 },
    );
  }
}
