import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession, resolveAuthenticatedPersistentIdentity } from "@/lib/identity/application-session";
import { normalizeBootstrapName } from "@/lib/identity/first-admin-bootstrap";

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "bootstrap") {
    return NextResponse.json({ error: resolution.kind === "unauthenticated" ? "Authentication required." : "TraceKit has already been initialized." }, { status: resolution.kind === "unauthenticated" ? 401 : 409 });
  }
  const identity = await resolveAuthenticatedPersistentIdentity();
  if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const organizationName = normalizeBootstrapName(body?.organizationName);
  const accountName = normalizeBootstrapName(body?.accountName);
  if (!organizationName || !accountName) return NextResponse.json({ error: "Organization and account names are required." }, { status: 400 });
  try {
    const result = await identity.repository.bootstrapFirstAdmin({
      userId: identity.user.id,
      authenticatedIdentityId: identity.externalWorkosUserId,
      organizationName,
      accountName,
      correlationId: randomUUID(),
    });
    return NextResponse.json({ ok: true, role: result.roleKey }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/already initialized/i.test(message)) return NextResponse.json({ error: "TraceKit has already been initialized." }, { status: 409 });
    console.error("[TraceKit bootstrap] failed", { message: message.slice(0, 200) });
    return NextResponse.json({ error: "TraceKit could not be initialized." }, { status: 500 });
  }
}
