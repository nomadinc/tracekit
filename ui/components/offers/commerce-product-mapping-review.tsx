"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";

type Target = { businessContextId: string; canonicalOfferId: string; offerStepId: string; offerVariantId: string | null };
type Recommendation = Target & {
  ruleId: string;
  confidence: number;
  disposition: "auto_map" | "bulk_review" | "manual_review";
  evidence: { identityMatch: "provider_product_id" | "normalized_title" | "title_prefix"; scope: "provider_account" | "connection" | "organization"; priceMatches: number[]; priceEvidenceWeight: number };
};
type Product = {
  providerProductId: string; title: string; mappingStatus: string; mappingVersion: string;
  businessContextId: string | null; canonicalOfferId: string | null; offerStepId: string | null; offerVariantId: string | null;
  integrityStatus: string; orderCount: number; grossRevenue: number; refundCount: number; refundAmount: number;
  firstSeenAt: string; lastSeenAt: string; alertOpen: boolean; workItemOpen: boolean;
  recommendation: Recommendation | null; authorizedPreset: Target | null;
};
type CatalogRow = { id: string; name?: string; label?: string; role?: string; business_context_id?: string; canonical_offer_id?: string; offer_step_id?: string };
type History = { id: string; resulting_state: string; mapping_version: string; decided_by_user_id: string; reason: string; decided_at: string; offer_step_id: string | null };
type Payload = { ok: boolean; code?: string; requestId?: string; products: Product[]; targets: { contexts: CatalogRow[]; offers: CatalogRow[]; steps: CatalogRow[]; variants: CatalogRow[] }; history: History[] };
type BulkGroup = { key: string; target: Target; label: string; products: Product[]; revenue: number };

class ReviewLoadError extends Error { constructor(readonly code: string, readonly requestId?: string) { super(code); } }
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US");
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));

async function readReview(providerProductId?: string): Promise<Payload> {
  const query = providerProductId ? `?providerProductId=${encodeURIComponent(providerProductId)}` : "";
  const response = await fetch(`/api/commerce/product-mappings${query}`, { cache: "no-store" });
  const payload = await response.json() as Payload;
  if (!response.ok || !payload.ok) throw new ReviewLoadError(payload.code || "mapping_review_unavailable", payload.requestId || response.headers.get("x-tracekit-request-id") || undefined);
  return payload;
}

function targetKey(target: Target) { return [target.businessContextId, target.canonicalOfferId, target.offerStepId, target.offerVariantId || ""].join(":"); }
function bulkGroups(products: Product[], steps: CatalogRow[]): BulkGroup[] {
  const groups = new Map<string, BulkGroup>();
  for (const product of products) {
    const recommendation = product.recommendation;
    if (!recommendation || recommendation.disposition !== "bulk_review" || product.mappingStatus === "approved") continue;
    const target: Target = { businessContextId: recommendation.businessContextId, canonicalOfferId: recommendation.canonicalOfferId, offerStepId: recommendation.offerStepId, offerVariantId: recommendation.offerVariantId };
    const key = targetKey(target);
    const label = steps.find((row) => row.id === target.offerStepId)?.label || target.offerStepId;
    const group = groups.get(key) || { key, target, label, products: [], revenue: 0 };
    group.products.push(product); group.revenue += product.grossRevenue; groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

export function CommerceProductMappingReview() { return <AccessBoundary permission="offers.manage" variants={["client", "agency"]}><ReviewContent /></AccessBoundary>; }

function ReviewContent() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Payload | null>(null);
  const [bulkKey, setBulkKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadList = React.useCallback(async () => { setLoading(true); setError(null); try { setData(await readReview()); } catch { setError("Product mapping review is temporarily unavailable."); } finally { setLoading(false); } }, []);
  React.useEffect(() => { void loadList(); }, [loadList]);
  React.useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailLoading(false); return; }
    let current = true; setDetail(null); setError(null); setDetailLoading(true);
    readReview(selectedId).then((value) => { if (current) setDetail(value); }).catch((loadError: unknown) => {
      if (!current) return;
      if (loadError instanceof ReviewLoadError) setError(`The selected product could not be loaded. (${loadError.code}${loadError.requestId ? ` · request ${loadError.requestId}` : ""})`);
      else setError("The selected product could not be loaded. (unexpected_client_error)");
    }).finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; };
  }, [selectedId]);

  const groups = data ? bulkGroups(data.products, data.targets.steps) : [];
  const activeBulk = bulkKey ? groups.find((group) => group.key === bulkKey) || null : null;
  const selectedDetail = selectedId && detail?.products[0]?.providerProductId === selectedId ? detail : null;

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.035]" aria-labelledby="commerce-product-review-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Commerce catalog operations</div><h2 id="commerce-product-review-title" className="mt-1 text-2xl font-semibold">Commas product mapping review</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">High-confidence products can be approved as a group. Bulk approval is atomic: any stale item aborts the entire batch, while every successful product still receives its own audited decision.</p></div><button type="button" onClick={() => void loadList()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    {loading ? <p className="text-sm text-slate-500">Loading product intelligence…</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
    {data ? <RecommendationSummary products={data.products} groups={groups} onReviewGroup={(key) => { setBulkKey(key); setSelectedId(null); }} /> : null}
    {data && activeBulk ? <BulkDecisionPanel group={activeBulk} onCancel={() => setBulkKey(null)} onChanged={async () => { setBulkKey(null); await loadList(); }} /> : null}
    {data ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]"><ProductList products={data.products} steps={data.targets.steps} selectedId={selectedId} onSelect={(id) => { setBulkKey(null); setSelectedId(id); }} />{selectedDetail ? <DecisionPanel payload={selectedDetail} onChanged={async () => { const next = await readReview(selectedId!); setDetail(next); await loadList(); }} /> : <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">{detailLoading && selectedId ? `Loading ${selectedId} review…` : "Select one product for individual review, or use a bulk review group above."}</div>}</div> : null}
  </section>;
}

function RecommendationSummary({ products, groups, onReviewGroup }: { products: Product[]; groups: BulkGroup[]; onReviewGroup: (key: string) => void }) {
  const recommended = products.filter((product) => product.recommendation);
  const bulkCount = groups.reduce((sum, group) => sum + group.products.length, 0);
  const manual = products.filter((product) => !product.recommendation || product.recommendation.disposition === "manual_review");
  return <div className="space-y-3"><div className="grid gap-3 lg:grid-cols-3"><SummaryCard label="Recommended" value={`${recommended.length}`} detail="Registry-backed identity evidence" /><SummaryCard label="Bulk review ready" value={`${bulkCount}`} detail={`${groups.length} canonical target groups`} /><SummaryCard label="Manual review" value={`${manual.length}`} detail="No safe high-confidence recommendation" /></div>{groups.length ? <div className="rounded-xl border bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bulk review groups</div><div className="mt-3 grid gap-2 lg:grid-cols-2">{groups.map((group) => <button key={group.key} type="button" onClick={() => onReviewGroup(group.key)} className="flex items-center justify-between rounded-lg border bg-white px-3 py-3 text-left hover:border-teal-400 dark:bg-transparent"><span><strong className="block text-sm">{group.label}</strong><span className="text-xs text-slate-500">{group.products.length} products · {money.format(group.revenue)}</span></span><span className="text-xs font-semibold text-teal-700 dark:text-teal-300">Review group</span></button>)}</div></div> : null}</div>;
}
function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-xl border p-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>; }

function BulkDecisionPanel({ group, onCancel, onChanged }: { group: BulkGroup; onCancel: () => void; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = React.useState(() => new Set(group.products.map((product) => product.providerProductId)));
  const [reason, setReason] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => { setSelected(new Set(group.products.map((product) => product.providerProductId))); setReason(""); setConfirming(false); setNotice(null); }, [group.key]);
  const chosen = group.products.filter((product) => selected.has(product.providerProductId));
  const chosenRevenue = chosen.reduce((sum, product) => sum + product.grossRevenue, 0);
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setConfirming(false); }
  async function submit() {
    setSubmitting(true); setNotice(null);
    try {
      const response = await fetch("/api/commerce/product-mappings/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: chosen.map((product) => ({ providerProductId: product.providerProductId, expectedMappingVersion: product.mappingVersion })), ...group.target, reason, confirmation: "confirm-bulk-product-mapping-decisions" }) });
      const output = await response.json() as { ok: boolean; code?: string; decisionCount?: number; reload?: boolean };
      if (!response.ok || !output.ok) {
        if (["stale_mapping_version", "bulk_recommendation_changed"].includes(output.code || "")) { setNotice("The batch changed while it was under review. Nothing was saved. Reloading the current recommendations now."); await onChanged(); return; }
        if (output.code === "bulk_mapping_not_deployed") { setNotice("Bulk mapping is not available in this environment until the database migration is deployed."); return; }
        setNotice("The bulk mapping decision was not saved. No partial batch should have been committed."); return;
      }
      setNotice(`${output.decisionCount || chosen.length} mapping decisions recorded. Alert/work-item reconciliation is pending the evaluator.`); await onChanged();
    } catch { setNotice("The bulk mapping decision was not saved."); }
    finally { setSubmitting(false); }
  }
  return <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-400/30 dark:bg-teal-400/5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Bulk decision</div><h3 className="mt-1 text-lg font-semibold">{group.label}</h3><p className="text-sm text-slate-500">{chosen.length} selected products · {money.format(chosenRevenue)} observed gross revenue</p></div><button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-xs">Close</button></div><div className="mt-3 max-h-64 overflow-auto rounded-lg border bg-white dark:bg-transparent">{group.products.map((product) => <label key={product.providerProductId} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"><input type="checkbox" checked={selected.has(product.providerProductId)} onChange={() => toggle(product.providerProductId)} /><span className="min-w-0 flex-1"><strong className="block truncate">{product.title}</strong><span className="font-mono text-xs text-slate-500">{product.providerProductId} · {product.recommendation?.confidence}% confidence</span></span><span className="text-xs tabular-nums text-slate-500">{number.format(product.orderCount)} orders · {money.format(product.grossRevenue)}</span></label>)}</div><label className="mt-3 block text-sm">Operator reason<textarea value={reason} onChange={(event) => { setReason(event.target.value); setConfirming(false); }} maxLength={500} className="mt-1 min-h-20 w-full rounded-lg border bg-white p-2 dark:bg-transparent" placeholder="Why is this group approval authorized?" /></label>{!confirming ? <button type="button" disabled={!chosen.length || !reason.trim()} onClick={() => setConfirming(true)} className="mt-3 w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">Review {chosen.length} decisions</button> : <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-400/10"><strong>Confirm atomic bulk approval</strong><p className="mt-1">TraceKit will append one audited decision per selected product. If any mapping version or recommendation changed, the entire batch fails and rolls back.</p><div className="mt-2 flex gap-2"><button type="button" disabled={submitting} onClick={() => void submit()} className="rounded-lg bg-amber-900 px-3 py-2 text-white disabled:opacity-50">{submitting ? "Submitting…" : `Confirm ${chosen.length} decisions`}</button><button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-2">Cancel</button></div></div>}{notice ? <p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p> : null}</div>;
}

function ProductList({ products, steps, selectedId, onSelect }: { products: Product[]; steps: CatalogRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div className="overflow-hidden rounded-xl border"><div className="border-b bg-slate-50 px-4 py-3 text-sm font-medium dark:bg-white/5">Provider products · ranked by gross revenue</div><div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500 dark:bg-ink"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Recommendation</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2">Review</th></tr></thead><tbody className="divide-y">{products.map((product) => { const rec = product.recommendation; const stepLabel = rec ? steps.find((row) => row.id === rec.offerStepId)?.label || rec.offerStepId : null; return <tr key={product.providerProductId} className={selectedId === product.providerProductId ? "bg-teal-50/70 dark:bg-teal-400/10" : ""}><td className="px-3 py-3"><span className="block font-medium">{product.title}</span><span className="font-mono text-xs text-slate-500">{product.providerProductId}</span></td><td className="px-3 py-3"><span className="rounded-full border px-2 py-1 text-xs">{product.mappingStatus.replaceAll("_", " ")}</span></td><td className="px-3 py-3">{rec ? <div><span className="block font-medium">{stepLabel}</span><span className="text-xs text-slate-500">{rec.confidence}% · {rec.disposition.replaceAll("_", " ")}</span></div> : <span className="text-xs text-slate-400">Manual review</span>}</td><td className="px-3 py-3 text-right tabular-nums">{number.format(product.orderCount)}</td><td className="px-3 py-3 text-right tabular-nums">{money.format(product.grossRevenue)}</td><td className="px-3 py-3"><button type="button" onClick={() => onSelect(product.providerProductId)} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-slate-950">Review</button></td></tr>; })}</tbody></table></div></div>;
}

function DecisionPanel({ payload, onChanged }: { payload: Payload; onChanged: () => Promise<void> }) {
  const product = payload.products[0]; const recommendation = product.recommendation;
  const preset = recommendation ? { businessContextId: recommendation.businessContextId, canonicalOfferId: recommendation.canonicalOfferId, offerStepId: recommendation.offerStepId, offerVariantId: recommendation.offerVariantId } : product.authorizedPreset;
  const hasPersistedTarget = product.mappingStatus === "approved" && Boolean(product.businessContextId && product.canonicalOfferId && product.offerStepId);
  const initialContextId = hasPersistedTarget ? product.businessContextId || "" : preset?.businessContextId || product.businessContextId || "";
  const initialOfferId = hasPersistedTarget ? product.canonicalOfferId || "" : preset?.canonicalOfferId || product.canonicalOfferId || "";
  const initialStepId = hasPersistedTarget ? product.offerStepId || "" : preset?.offerStepId || product.offerStepId || "";
  const initialVariantId = hasPersistedTarget ? product.offerVariantId || "" : preset?.offerVariantId || product.offerVariantId || "";
  const persistedStepLabel = product.offerStepId ? payload.targets.steps.find((row) => row.id === product.offerStepId)?.label || product.offerStepId : "None";
  const presetStepLabel = preset?.offerStepId ? payload.targets.steps.find((row) => row.id === preset.offerStepId)?.label || preset.offerStepId : null;
  const presetDiffers = Boolean(hasPersistedTarget && preset && (product.businessContextId !== preset.businessContextId || product.canonicalOfferId !== preset.canonicalOfferId || product.offerStepId !== preset.offerStepId || (product.offerVariantId || null) !== (preset.offerVariantId || null)));
  const [result, setResult] = React.useState<"approved" | "rejected">("approved"); const [contextId, setContextId] = React.useState(initialContextId); const [offerId, setOfferId] = React.useState(initialOfferId); const [stepId, setStepId] = React.useState(initialStepId); const [variantId, setVariantId] = React.useState(initialVariantId); const [reason, setReason] = React.useState(""); const [confirming, setConfirming] = React.useState(false); const [submitting, setSubmitting] = React.useState(false); const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => { setResult("approved"); setContextId(initialContextId); setOfferId(initialOfferId); setStepId(initialStepId); setVariantId(initialVariantId); setReason(""); setConfirming(false); setNotice(null); }, [product.providerProductId, product.mappingVersion, initialContextId, initialOfferId, initialStepId, initialVariantId]);
  const offers = payload.targets.offers.filter((row) => row.business_context_id === contextId); const steps = payload.targets.steps.filter((row) => row.canonical_offer_id === offerId); const variants = payload.targets.variants.filter((row) => row.offer_step_id === stepId); const targetComplete = result === "rejected" || Boolean(contextId && offerId && stepId);
  async function submit() { setSubmitting(true); setNotice(null); const body = { providerProductId: product.providerProductId, result, expectedMappingVersion: product.mappingVersion, businessContextId: result === "approved" ? contextId : undefined, canonicalOfferId: result === "approved" ? offerId : undefined, offerStepId: result === "approved" ? stepId : undefined, offerVariantId: result === "approved" && variantId ? variantId : undefined, reason, confirmation: "confirm-product-mapping-decision" }; try { const response = await fetch("/api/commerce/product-mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const output = await response.json() as { ok: boolean; code?: string }; if (!response.ok || !output.ok) { if (output.code === "stale_mapping_version") { setNotice("This product changed while it was under review. Reloading current state."); await onChanged(); return; } setNotice(output.code === "mapping_target_invalid" ? "The selected catalog hierarchy is no longer valid." : "The mapping decision was not saved."); return; } setNotice("Decision recorded. Evaluator reconciliation is pending."); setConfirming(false); await onChanged(); } catch { setNotice("The mapping decision was not saved."); } finally { setSubmitting(false); } }
  return <div className="space-y-4 rounded-xl border p-4"><div><h3 className="font-semibold">{product.title}</h3><div className="font-mono text-xs text-slate-500">{product.providerProductId}</div></div><dl className="grid grid-cols-2 gap-3 text-sm"><Metric label="Orders" value={number.format(product.orderCount)} /><Metric label="Gross revenue" value={money.format(product.grossRevenue)} /><Metric label="Refunds" value={`${number.format(product.refundCount)} · ${money.format(product.refundAmount)}`} /><Metric label="Observed" value={`${date(product.firstSeenAt)} – ${date(product.lastSeenAt)}`} /><Metric label="Mapping status" value={product.mappingStatus.replaceAll("_", " ")} /><Metric label="Mapping version" value={product.mappingVersion} mono /></dl><div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">{product.alertOpen || product.workItemOpen ? <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Open unmapped-product alert/work item</span> : <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />No open unmapped-product condition</span>}</div>{recommendation ? <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100"><ShieldCheck className="mr-1 inline h-4 w-4" /><strong>TraceKit recommendation:</strong> {presetStepLabel}. {recommendation.confidence}% confidence · {recommendation.evidence.identityMatch.replaceAll("_", " ")} · {recommendation.evidence.scope.replaceAll("_", " ")}. Price is supporting evidence only.</div> : null}{presetDiffers ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-400/10 dark:text-amber-100"><AlertTriangle className="mr-1 inline h-4 w-4" /><strong>Mapping mismatch:</strong> persisted step is <strong>{persistedStepLabel}</strong>; recommended target is <strong>{presetStepLabel}</strong>.</div> : null}<fieldset className="space-y-3"><legend className="text-sm font-semibold">Decision</legend><div className="flex gap-4 text-sm"><label><input type="radio" checked={result === "approved"} onChange={() => setResult("approved")} /> Approve</label><label><input type="radio" checked={result === "rejected"} onChange={() => setResult("rejected")} /> Reject</label></div>{result === "approved" ? <div className="grid gap-2"><Select label="Business context" value={contextId} onChange={(v) => { setContextId(v); setOfferId(""); setStepId(""); setVariantId(""); }} rows={payload.targets.contexts} /><Select label="Canonical offer" value={offerId} onChange={(v) => { setOfferId(v); setStepId(""); setVariantId(""); }} rows={offers} /><Select label="Offer step" value={stepId} onChange={(v) => { setStepId(v); setVariantId(""); }} rows={steps} /><Select label="Variant (optional)" value={variantId} onChange={setVariantId} rows={variants} optional /></div> : <p className="text-xs text-slate-500">Rejection records no canonical target.</p>}<label className="block text-sm">Operator reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required className="mt-1 min-h-20 w-full rounded-lg border bg-transparent p-2" placeholder="Why is this decision authorized?" /></label></fieldset>{!confirming ? <button type="button" disabled={!reason.trim() || !targetComplete} onClick={() => setConfirming(true)} className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">Review decision</button> : <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-400/10"><strong>Confirm {result === "approved" ? "mapping approval" : "mapping rejection"}</strong><p>This appends an audited decision using version <span className="font-mono text-xs">{product.mappingVersion}</span>.</p><div className="flex gap-2"><button type="button" disabled={submitting} onClick={() => void submit()} className="rounded-lg bg-amber-900 px-3 py-2 text-white disabled:opacity-50">{submitting ? "Submitting…" : "Confirm decision"}</button><button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-2">Cancel</button></div></div>}{notice ? <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p> : null}<div><h4 className="text-sm font-semibold">Decision history</h4>{payload.history.length ? <ol className="mt-2 space-y-2">{payload.history.map((item) => <li key={item.id} className="rounded-lg border p-2 text-xs"><span className="font-semibold">{item.resulting_state}</span> · {date(item.decided_at)}<div className="mt-1 text-slate-500">{item.reason}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{item.mapping_version}</div></li>)}</ol> : <p className="mt-2 text-xs text-slate-500">No mapping decisions recorded.</p>}</div></div>;
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={mono ? "break-all font-mono text-xs" : "font-medium"}>{value}</dd></div>; }
function Select({ label, value, onChange, rows, optional = false }: { label: string; value: string; onChange: (value: string) => void; rows: CatalogRow[]; optional?: boolean }) { return <label className="text-sm">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-slate-950"><option value="">{optional ? "No variant" : `Select ${label.toLowerCase()}`}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.name || row.label || row.role || row.id}</option>)}</select></label>; }
