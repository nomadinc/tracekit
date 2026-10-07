import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import {
  runWs019M44PhaseBFixture,
  WS019_M44_PHASE_B,
  type Ws019M44FixtureOperation,
} from "@/lib/mcp/m44-phase-b-acceptance";

const OPERATIONS = new Set<Ws019M44FixtureOperation>(["create", "resolve-awaiting", "resolve-recovery"]);
const unavailable = () => NextResponse.json(
  { error: "The requested resource is unavailable." },
  { status: 404, headers: { "Cache-Control": "no-store" } },
);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    if (!sameOrigin(request) || new URL(request.url).searchParams.size !== 0) return unavailable();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) return unavailable();
    const operation = (await context.params).operation as Ws019M44FixtureOperation;
    if (!OPERATIONS.has(operation)) return unavailable();

    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return unavailable();
    requirePermission(resolution.session, "actions.execute");
    if (resolution.session.activeOrganization.id !== WS019_M44_PHASE_B.organizationId) return unavailable();

    const result = await runWs019M44PhaseBFixture(operation, {
      organizationId: resolution.session.activeOrganization.id,
      actorUserId: resolution.session.user.id,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailable();
  }
}
