import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
import { authorizeStemFirstOffer } from "@/lib/commerce/stem-first-offer";
import { CommercePersistenceError, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

// Explicit bounded action alongside the existing mapping route. No generic
// organization hints, actor IDs, target IDs or product overrides are accepted.
export async function POST(request: Request) {
  const requestId = randomUUID();
  const reply = (body: Record<string, unknown>, status: number) =>
    NextResponse.json({ ...body, requestId }, { status, headers: { "x-tracekit-request-id": requestId } });
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return reply({ ok: false, code: "request_verification_failed" }, 403);
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).length !== 1 || body.confirmation !== "activate-approved-stem-product-8")
      return reply({ ok: false, code: "explicit_confirmation_required" }, 400);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") throw new AuthorizationDeniedError();
    authorizeStemFirstOffer(resolution.session);
    const result = await commercePersistenceRequest("rpc/ws021_activate_stem_first_offer", {
      method: "POST",
      body: JSON.stringify({ p_actor_id: resolution.session.user.id, p_correlation_id: requestId }),
    }) as { ok?: boolean; offerId?: string; mappingId?: string; replayed?: boolean };
    if (result.ok !== true || typeof result.offerId !== "string" || typeof result.mappingId !== "string")
      return reply({ ok: false, code: "mapping_result_unavailable" }, 502);
    return reply({ ...result }, result.replayed ? 200 : 201);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return reply({ ok: false, code: "resource_unavailable" }, 404);
    if (error instanceof CommercePersistenceError && error.databaseCode === "40001")
      return reply({ ok: false, code: "catalog_state_conflict" }, 409);
    return reply({ ok: false, code: "mapping_activation_unavailable" }, 503);
  }
}
