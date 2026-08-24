import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { normalizeConfidence, parseReviewFilters } from "@/lib/chargebacks/review";

type Row = Record<string, any>;

function unavailable() { return NextResponse.json({ ok: false, error: "resource_unavailable" }, { status: 404 }); }
function enc(value: string) { return encodeURIComponent(value); }
function qLike(value: string) { return `*${value.replace(/[,*()]/g, " ")}*`; }

async function authorizedOrganization() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return null;
  return resolution.session.activeOrganization.id;
}

async function listReconciliations(organizationId: string, ids: string[]) {
  if (!ids.length) return [] as Row[];
  return await commercePersistenceRequest(`commerce_dispute_reconciliations?organization_id=eq.${enc(organizationId)}&dispute_id=in.(${ids.map(enc).join(",")})&algorithm_version=eq.historical-v1`);
}

function summary(rows: Row[], reconciliations: Row[] = []) {
  const counts: Record<string, number> = {};
  let disputedAmount = 0; let fees = 0; const currencies = new Set<string>();
  for (const row of rows) {
    const status = String(row.status || row.state || "unknown").toLowerCase().replace(/[\s-]+/g, "_"); counts[status] = (counts[status] || 0) + 1;
    disputedAmount += Number(row.amount || 0); fees += Number(row.dispute_fee || 0);
    if (row.currency) currencies.add(String(row.currency));
  }
  const confidence: Record<string, number> = {};
  for (const row of rows) { const c = normalizeConfidence(row.matching_state); confidence[c] = (confidence[c] || 0) + 1; }
  for (const row of reconciliations) { const c = normalizeConfidence(row.confidence_band); confidence[c] = (confidence[c] || 0) + 1; }
  return { total: rows.length, disputedAmount: currencies.size <= 1 ? disputedAmount : null, fees: currencies.size <= 1 ? fees : null, currencies: Array.from(currencies), statuses: counts, confidence };
}

export async function GET(request: Request) {
  const organizationId = await authorizedOrganization();
  if (!organizationId) return unavailable();
  const filters = parseReviewFilters(new URL(request.url).searchParams);
  try {
    const offset = (filters.page - 1) * filters.pageSize;
    const parts = [
      `organization_id=eq.${enc(organizationId)}`,
      `order=dispute_date.desc.nullslast,created_at.desc`,
      `limit=${filters.pageSize}`, `offset=${offset}`,
    ];
    if (filters.status) parts.push(`status=ilike.${enc(filters.status)}`);
    if (filters.reason) parts.push(`reason=ilike.${enc(qLike(filters.reason))}`);
    if (filters.product) parts.push(`product_evidence=ilike.${enc(qLike(filters.product))}`);
    if (filters.from) parts.push(`dispute_date=gte.${enc(filters.from)}`);
    if (filters.to) parts.push(`dispute_date=lte.${enc(filters.to)}`);
    if (filters.search) parts.push(`or=(customer_email_normalized.ilike.${enc(qLike(filters.search))},product_evidence.ilike.${enc(qLike(filters.search))},source_row_identity.ilike.${enc(qLike(filters.search))})`);
    if (filters.matched === "matched") parts.push(`matching_state=in.(high_confidence,medium_confidence)`);
    if (filters.matched === "unmatched") parts.push(`matching_state=eq.unmatched`);
    if (["high_confidence", "medium_confidence", "needs_review", "unmatched"].includes(filters.confidence)) parts.push(`matching_state=eq.${filters.confidence}`);
    const disputes = await commercePersistenceRequest(`commerce_historical_disputes?select=id,account_id,organization_id,connection_id,provider_account_id,status,state,transaction_date,dispute_date,closed_date,customer_email_normalized,product_evidence,amount,dispute_fee,payment_method,reason,matching_state&${parts.join("&")}`) as Row[];
    const recs = await listReconciliations(organizationId, disputes.map((row) => String(row.id)));
    const aggregateDisputes = await commercePersistenceRequest(`commerce_historical_disputes?select=id,status,state,amount,dispute_fee,matching_state&organization_id=eq.${enc(organizationId)}&limit=20000`) as Row[];
    const recByDispute = new Map(recs.map((row) => [String(row.dispute_id), row]));
    const rows = disputes.map((row) => {
      const reconciliation = recByDispute.get(String(row.id));
      return { id: row.id, source: "historical", sourceLabel: "Historical Import", status: row.status || row.state, disputeDate: row.dispute_date, transactionDate: row.transaction_date, amount: row.amount, fee: row.dispute_fee, reason: row.reason, product: row.product_evidence, paymentMethod: row.payment_method, customer: row.customer_email_normalized ? String(row.customer_email_normalized).replace(/(^.).*(@.*$)/, "$1•••$2") : null, confidence: normalizeConfidence(reconciliation?.confidence_band || row.matching_state), score: reconciliation?.numeric_score ?? null, candidateCount: reconciliation?.candidate_count ?? 0, matchedOrderId: reconciliation?.matched_canonical_order_id || null, factors: reconciliation?.evidence_factors || {}, detailId: row.id };
    });
    const live = await commercePersistenceRequest(`commerce_provider_disputes?organization_id=eq.${enc(organizationId)}&order=opened_at.desc.nullslast,updated_at.desc&limit=${filters.pageSize}`) as Row[];
    const liveRows = live.map((row) => ({ id: `live:${row.id}`, source: "live", sourceLabel: "Live Provider Event", status: row.status || row.state, disputeDate: row.opened_at || row.updated_at, transactionDate: null, amount: row.amount, fee: row.fee, reason: row.reason || row.reason_code, product: row.product_reference, paymentMethod: null, customer: row.buyer_reference, confidence: row.reconciliation_state === "matched" ? "high_confidence" : row.reconciliation_state === "review" ? "needs_review" : "unmatched", score: null, candidateCount: 0, matchedOrderId: row.matched_canonical_order_id || null, factors: {}, detailId: row.id } as Row));
    const displayRows = [...rows, ...liveRows].slice(0, filters.pageSize);
    return NextResponse.json({ ok: true, rows: displayRows, pagination: { page: filters.page, pageSize: filters.pageSize, returned: displayRows.length, hasMore: rows.length === filters.pageSize || liveRows.length === filters.pageSize }, summary: summary(aggregateDisputes), sourceCounts: { historical: aggregateDisputes.length, live: live.length }, filters });
  } catch { return NextResponse.json({ ok: false, error: "chargeback_review_unavailable" }, { status: 503 }); }
}

export async function POST() { return NextResponse.json({ ok: false, error: "read_only_review" }, { status: 405 }); }
