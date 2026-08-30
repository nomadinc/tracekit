import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const CONFIRMATION = "create-push-button-system-catalog";
const ORGANIZATION_ID = "5f1de64a-1b37-40bb-81c8-32197eda0b41";
const ACCOUNT_ID = "39d895f9-71ac-44d3-ac33-6e9043f6267e";
const BUSINESS_CONTEXT_ID = "push-button-system-5f1de64a";
const CANONICAL_OFFER_ID = "b842611c-9918-40ac-9241-d542a8c6f8b4";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

function response(requestId: string, body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, requestId }, { status, headers: { "x-tracekit-request-id": requestId } });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return response(requestId, { ok: false, code: "request_verification_failed" }, 403);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    }
    requirePermission(resolution.session, "offers.manage");
    if (resolution.session.activeOrganization.id !== ORGANIZATION_ID || resolution.session.activeAccount.id !== ACCOUNT_ID) {
      return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).length !== 1 || body.confirmation !== CONFIRMATION) {
      return response(requestId, { ok: false, code: "explicit_confirmation_required" }, 400);
    }
    const rows = await commercePersistenceRequest("rpc/create_push_button_system_catalog", {
      method: "POST",
      body: JSON.stringify({
        p_actor_user_id: resolution.session.user.id,
        p_correlation_id: requestId,
        p_confirmation: CONFIRMATION,
      }),
    });
    const result = rows[0] || {};
    if (result.business_context_id !== BUSINESS_CONTEXT_ID || result.canonical_offer_id !== CANONICAL_OFFER_ID || result.offer_step_count !== 7 || result.variant_count !== 0) {
      return response(requestId, { ok: false, code: "catalog_creation_result_invalid" }, 502);
    }
    return response(requestId, {
      ok: true,
      business_context_id: BUSINESS_CONTEXT_ID,
      canonical_offer_id: CANONICAL_OFFER_ID,
      offer_step_count: 7,
      variant_count: 0,
      created_step_count: Number.isInteger(result.created_step_count) ? result.created_step_count : null,
    }, 200);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    return response(requestId, { ok: false, code: "catalog_creation_failed" }, 500);
  }
}
