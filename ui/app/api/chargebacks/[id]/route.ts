import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { evidenceFactorLabels, normalizeConfidence } from "@/lib/chargebacks/review";
function enc(v: string) { return encodeURIComponent(v); }
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolution = await resolveApplicationSession(); const organizationId = resolution.kind === "authenticated" ? resolution.session.activeOrganization?.id : null;
  if (!organizationId) return NextResponse.json({ ok: false, error: "resource_unavailable" }, { status: 404 });
  const id = (await context.params).id;
  try {
    if (id.startsWith("live:")) {
      const liveId = id.slice(5);
      const rows = await commercePersistenceRequest(`commerce_provider_disputes?organization_id=eq.${enc(organizationId)}&id=eq.${enc(liveId)}&limit=1`) as Record<string, any>[];
      if (!rows[0]) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      const row = rows[0];
      return NextResponse.json({ ok: true, dispute: { ...row, buyer_reference: row.buyer_reference ? "redacted" : null }, reconciliation: { confidence: row.reconciliation_state === "matched" ? "high_confidence" : row.reconciliation_state === "review" ? "needs_review" : "unmatched", score: null, candidateCount: 0, matchedOrderId: row.matched_canonical_order_id || null, factors: [] }, candidates: [] });
    }
    const disputes = await commercePersistenceRequest(`commerce_historical_disputes?organization_id=eq.${enc(organizationId)}&id=eq.${enc(id)}&limit=1`) as Record<string, any>[];
    const dispute = disputes[0]; if (!dispute) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const recs = await commercePersistenceRequest(`commerce_dispute_reconciliations?organization_id=eq.${enc(organizationId)}&dispute_id=eq.${enc(id)}&algorithm_version=eq.historical-v1&limit=1`) as Record<string, any>[];
    const reconciliation = recs[0] || null; let candidates: Record<string, any>[] = [];
    if (reconciliation?.confidence_band === "needs_review" && dispute.customer_email_normalized) {
      const identities = await commercePersistenceRequest(`person_source_identities?organization_id=eq.${enc(organizationId)}&connection_id=eq.${enc(dispute.connection_id)}&source_type=eq.email&normalized_value=eq.${enc(dispute.customer_email_normalized)}&select=person_id&limit=20`) as Record<string, any>[];
      const personIds = identities.map((row) => String(row.person_id)).filter(Boolean);
      if (personIds.length) candidates = await commercePersistenceRequest(`platform_orders?organization_id=eq.${enc(organizationId)}&connection_id=eq.${enc(dispute.connection_id)}&person_id=in.(${personIds.map(enc).join(",")})&order_ts=gte.${enc(`${dispute.transaction_date}T00:00:00Z`)}&order_ts=lte.${enc(`${dispute.transaction_date}T23:59:59Z`)}&select=canonical_order_id,order_ts,gross_amount,currency,payment_type,provider_order_id,provider_product_id,person_id&limit=20`) as Record<string, any>[];
    }
    return NextResponse.json({ ok: true, dispute: { ...dispute, customer_email_normalized: dispute.customer_email_normalized ? String(dispute.customer_email_normalized).replace(/(^.).*(@.*$)/, "$1•••$2") : null }, reconciliation: reconciliation ? { confidence: normalizeConfidence(reconciliation.confidence_band), score: reconciliation.numeric_score, candidateCount: reconciliation.candidate_count, matchedOrderId: reconciliation.matched_canonical_order_id, factors: evidenceFactorLabels(reconciliation.evidence_factors) } : null, candidates });
  } catch { return NextResponse.json({ ok: false, error: "chargeback_detail_unavailable" }, { status: 503 }); }
}
