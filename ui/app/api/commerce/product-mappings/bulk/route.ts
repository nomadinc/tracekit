import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CommercePersistenceError, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { loadProductMappingRecommendations } from "@/lib/commerce/product-mapping-intelligence-repository";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const ORGANIZATION_ID = "5f1de64a-1b37-40bb-81c8-32197eda0b41";
const ACCOUNT_ID = "39d895f9-71ac-44d3-ac33-6e9043f6267e";
const CONNECTION_ID = "ea1c2313-6120-4692-84c5-ec3562e7dcf6";
const PROVIDER_ACCOUNT_ID = "0369c701-717f-4c34-b230-8341bcdb7e65";
const select = "provider_product_row_id,provider_product_id,title,mapping_status,mapping_version,business_context_id,canonical_offer_id,offer_step_id,offer_variant_id";
const scope = `organization_id=eq.${ORGANIZATION_ID}&connection_id=eq.${CONNECTION_ID}&provider_account_id=eq.${PROVIDER_ACCOUNT_ID}`;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

function response(id: string, body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...body, requestId: id }, { status, headers: { "x-tracekit-request-id": id } });
}

async function session() {
  const resolved = await resolveApplicationSession();
  if (resolved.kind !== "authenticated" || !resolved.session.activeOrganization || resolved.session.activeOrganization.id !== ORGANIZATION_ID || resolved.session.activeAccount.id !== ACCOUNT_ID) throw new AuthorizationDeniedError();
  requirePermission(resolved.session, "offers.manage");
  return resolved.session;
}

type BulkItem = { providerProductId?: unknown; expectedMappingVersion?: unknown };

export async function POST(request: Request) {
  const id = randomUUID();
  try {
    const activeSession = await session();
    if (!sameOrigin(request)) return response(id, { ok: false, code: "request_verification_failed" }, 403);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return response(id, { ok: false, code: "validation_failed" }, 400);
    const allowed = new Set(["items", "businessContextId", "canonicalOfferId", "offerStepId", "offerVariantId", "reason", "confirmation"]);
    if (Object.keys(body).some((key) => !allowed.has(key)) || body.confirmation !== "confirm-bulk-product-mapping-decisions") {
      return response(id, { ok: false, code: "explicit_confirmation_required" }, 400);
    }

    const items = Array.isArray(body.items) ? body.items as BulkItem[] : [];
    const contextId = String(body.businessContextId || "");
    const offerId = String(body.canonicalOfferId || "");
    const stepId = String(body.offerStepId || "");
    const variantId = body.offerVariantId ? String(body.offerVariantId) : null;
    const reason = String(body.reason || "").trim();
    if (!items.length || items.length > 50 || !contextId || !offerId || !stepId || !reason || reason.length > 500) {
      return response(id, { ok: false, code: "validation_failed" }, 400);
    }

    const ids = items.map((item) => String(item.providerProductId || "").trim());
    const versions = new Map(items.map((item) => [String(item.providerProductId || "").trim(), String(item.expectedMappingVersion || "")]));
    if (ids.some((value) => !value) || new Set(ids).size !== ids.length || Array.from(versions.values()).some((value) => !value)) {
      return response(id, { ok: false, code: "validation_failed" }, 400);
    }

    const [targetContexts, targetOffers, targetSteps, targetVariants, allRows] = await Promise.all([
      commercePersistenceRequest(`tracekit_business_contexts?organization_id=eq.${ORGANIZATION_ID}&id=eq.${encodeURIComponent(contextId)}&status=eq.active&select=id&limit=1`),
      commercePersistenceRequest(`canonical_offers?organization_id=eq.${ORGANIZATION_ID}&business_context_id=eq.${encodeURIComponent(contextId)}&id=eq.${encodeURIComponent(offerId)}&status=eq.active&select=id&limit=1`),
      commercePersistenceRequest(`offer_steps?organization_id=eq.${ORGANIZATION_ID}&canonical_offer_id=eq.${encodeURIComponent(offerId)}&id=eq.${encodeURIComponent(stepId)}&select=id&limit=1`),
      variantId ? commercePersistenceRequest(`offer_variants?organization_id=eq.${ORGANIZATION_ID}&offer_step_id=eq.${encodeURIComponent(stepId)}&id=eq.${encodeURIComponent(variantId)}&select=id&limit=1`) : Promise.resolve([{}]),
      commercePersistenceRequest(`commerce_product_mapping_review_v1?${scope}&select=${select}&limit=100`),
    ]);
    if (!targetContexts[0] || !targetOffers[0] || !targetSteps[0] || !targetVariants[0]) return response(id, { ok: false, code: "mapping_target_invalid" }, 400);

    const requested = allRows.filter((row) => ids.includes(String(row.provider_product_id)));
    if (requested.length !== ids.length) return response(id, { ok: false, code: "product_not_found", reload: true }, 404);

    const stale = requested.filter((row) => String(row.mapping_version) !== versions.get(String(row.provider_product_id))).map((row) => String(row.provider_product_id));
    if (stale.length) return response(id, { ok: false, code: "stale_mapping_version", staleProviderProductIds: stale, reload: true }, 409);

    const recommendations = await loadProductMappingRecommendations(
      { organizationId: ORGANIZATION_ID, connectionId: CONNECTION_ID, providerAccountId: PROVIDER_ACCOUNT_ID, provider: "commas" },
      requested.map((row) => ({ providerProductId: String(row.provider_product_id), title: String(row.title || "") })),
    );

    const invalidRecommendation = requested.filter((row) => {
      const recommendation = recommendations.get(String(row.provider_product_id));
      return !recommendation || recommendation.disposition === "manual_review" || recommendation.businessContextId !== contextId || recommendation.canonicalOfferId !== offerId || recommendation.offerStepId !== stepId || (recommendation.offerVariantId || null) !== variantId;
    });
    if (invalidRecommendation.length) {
      return response(id, { ok: false, code: "bulk_recommendation_changed", providerProductIds: invalidRecommendation.map((row) => String(row.provider_product_id)), reload: true }, 409);
    }

    const rpcItems = requested.map((row) => ({
      provider_product_id: String(row.provider_product_row_id),
      expected_mapping_version: String(row.mapping_version),
      mapping_version: `operator-bulk:${new Date().toISOString()}:${randomUUID()}`,
    }));

    const result = await commercePersistenceRequest("rpc/decide_commerce_product_mapping_bulk", {
      method: "POST",
      body: JSON.stringify({
        p_organization_id: ORGANIZATION_ID,
        p_connection_id: CONNECTION_ID,
        p_provider_account_id: PROVIDER_ACCOUNT_ID,
        p_business_context_id: contextId,
        p_canonical_offer_id: offerId,
        p_offer_step_id: stepId,
        p_offer_variant_id: variantId,
        p_items: rpcItems,
        p_decided_by_user_id: activeSession.user.id,
        p_reason: reason,
        p_correlation_id: id,
      }),
    });

    return response(id, {
      ok: true,
      decisionCount: Number((result[0] as Record<string, unknown> | undefined)?.decision_count || items.length),
      providerProductIds: ids,
      alertReconciliation: "pending_evaluator",
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return response(id, { ok: false, code: "resource_unavailable" }, 404);
    if (error instanceof CommercePersistenceError) {
      if (error.databaseCode === "40001") return response(id, { ok: false, code: "stale_mapping_version", reload: true }, 409);
      if (["22023", "23503"].includes(error.databaseCode)) return response(id, { ok: false, code: "mapping_target_invalid" }, 400);
      if (error.databaseCode === "PGRST202") return response(id, { ok: false, code: "bulk_mapping_not_deployed" }, 503);
    }
    return response(id, { ok: false, code: "bulk_mapping_decision_failed" }, 500);
  }
}
