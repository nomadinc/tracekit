import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import {
  AuthorizationDeniedError,
  requireResourceScope,
} from "@/lib/identity/authorization-gateway";

type CanonicalOfferRow = {
  id: string;
  organization_id: string;
  business_context_id: string;
  name: string;
  status: string;
};

function reply(
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { "x-tracekit-request-id": requestId } },
  );
}

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization)
      throw new AuthorizationDeniedError();

    const organizationId = resolution.session.activeOrganization.id;
    requireResourceScope(resolution.session, organizationId, "offers.view");
    const rows = (await commercePersistenceRequest(
      `canonical_offers?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=id,organization_id,business_context_id,name,status&order=name.asc`,
    )) as CanonicalOfferRow[];

    return reply(requestId, {
      ok: true,
      offers: rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        businessContextId: row.business_context_id,
        name: row.name,
        status: row.status,
      })),
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError)
      return reply(requestId, { ok: false, code: "resource_unavailable" }, 404);
    return reply(requestId, { ok: false, code: "offers_unavailable" }, 500);
  }
}
