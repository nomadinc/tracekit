"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";

type Target = { businessContextId: string; canonicalOfferId: string; offerStepId: string; offerVariantId: string | null };
type Recommendation = Target & {
  ruleId: string;
  confidence: number;
  disposition: "auto_map" | "bulk_review" | "manual_review";
  evidence: {
    identityMatch: "provider_product_id" | "normalized_title" | "title_prefix";
    scope: "provider_account" | "connection" | "organization";
    priceMatches: number[];
    priceEvidenceWeight: number;
  };
};
type Product = {
  providerProductId: string;
  title: string;
  mappingStatus: string;
  mappingVersion: string;
  businessContextId: string | null;
  canonicalOfferId: string | null;
  offerStepId: string | null;
  offerVariantId: string | null;
  integrityStatus: string;
  orderCount: number;
  grossRevenue: number;
  refundCount: number;
  refundAmount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  alertOpen: boolean;
  workItemOpen: boolean;
  recommendation: Recommendation | null;
  authorizedPreset: Target | null;
};
type CatalogRow = { id: string; name?: string; label?: string; role?: string; business_context_id?: string; canonical_offer_id?: string; offer_step_id?: string };
type History = { id: string; resulting_state: string; mapping_version: string; decided_by_user_id: string; reason: string; decided_at: string; offer_step_id: string | null };
type Payload = { ok: boolean; code?: string; requestId?: string; products: Product[]; targets: { contexts: CatalogRow[]; offers: CatalogRow[]; steps: CatalogRow[]; variants: CatalogRow[] }; history: History[] };

class ReviewLoadError extends Error {
  constructor(readonly code: string, readonly requestId?: string) { super(code); }
}

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

export function CommerceProductMappingReview() {
  return <AccessBoundary permission="offers.manage" variants={["client", "agency"]}><ReviewContent /></AccessBoundary>;
}

function ReviewContent() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadList = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await readReview()); } catch { setError("Product mapping review is temporarily unavailable."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void loadList(); }, [loadList]);
  React.useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailLoading(false); return; }
    let current = true;
    setDetail(null);
    setError(null);
    setDetailLoading(true);
    readReview(selectedId)
      .then((value) => { if (current) setDetail(value); })
      .catch((loadError: unknown) => {
        if (!current) return;
        if (loadError instanceof ReviewLoadError) {
          const diagnostic = loadError.requestId ? `${loadError.code} · request ${loadError.requestId}` : loadError.code;
          setError(`The selected product could not be loaded. (${diagnostic})`);
        } else {
          setError("The selected product could not be loaded. (unexpected_client_error)");
        }
      })
      .finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; };
  }, [selectedId]);

  const selectedDetail = selectedId && detail?.products[0]?.providerProductId === selectedId ? detail : null;

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[.035]" aria-labelledby="commerce-product-review-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Commerce catalog operations</div><h2 id="commerce-product-review-title" className="mt-1 text-2xl font-semibold">Commas product mapping review</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">TraceKit now groups high-confidence product recommendations for faster review. Every saved mapping still uses the guarded mapping version and appends an individual audit decision.</p></div>
      <button type="button" onClick={() => void loadList()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>
    {loading ? <p className="text-sm text-slate-500">Loading product intelligence…</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
    {data ? <RecommendationSummary products={data.products} steps={data.targets.steps} /> : null}
    {data ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
      <ProductList products={data.products} steps={data.targets.steps} selectedId={selectedId} onSelect={setSelectedId} />
      {selectedDetail ? <DecisionPanel payload={selectedDetail} onChanged={async () => { const next = await readReview(selectedId!); setDetail(next); await loadList(); }} /> : <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">{detailLoading && selectedId ? `Loading ${selectedId} review…` : "Select a product to review its financial impact, recommendation evidence, target, and decision history."}</div>}
    </div> : null}
  </section>;
}

function RecommendationSummary({ products, steps }: { products: Product[]; steps: CatalogRow[] }) {
  const recommended = products.filter((product) => product.recommendation);
  const bulk = recommended.filter((product) => product.recommendation?.disposition === "bulk_review");
  const manual = products.filter((product) => !product.recommendation || product.recommendation.disposition === "manual_review");
  const groups = new Map<string, { label: string; count: number; revenue: number }>();
  for (const product of bulk) {
    const stepId = product.recommendation!.offerStepId;
    const label = steps.find((row) => row.id === stepId)?.label || stepId;
    const current = groups.get(stepId) || { label, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += product.grossRevenue;
    groups.set(stepId, current);
  }
  return <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
    <SummaryCard label="Recommended" value={`${recommended.length}`} detail="Products with registry-backed identity evidence" />
    <SummaryCard label="Bulk review ready" value={`${bulk.length}`} detail={groups.size ? `${groups.size} canonical target groups` : "No groups ready yet"} />
    <SummaryCard label="Manual review" value={`${manual.length}`} detail="No safe high-confidence recommendation" />
    {groups.size ? <div className="lg:col-span-3 rounded-xl border bg-slate-50 p-3 dark:bg-white/5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bulk review groups</div><div className="mt-2 flex flex-wrap gap-2">{[...groups.values()].sort((a,b)=>b.revenue-a.revenue).map((group)=><span key={group.label} className="rounded-full border bg-white px-3 py-1.5 text-xs dark:bg-transparent"><strong>{group.label}</strong> · {group.count} products · {money.format(group.revenue)}</span>)}</div></div> : null}
  </div>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border p-3"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function ProductList({ products, steps, selectedId, onSelect }: { products: Product[]; steps: CatalogRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <div className="overflow-hidden rounded-xl border"><div className="border-b bg-slate-50 px-4 py-3 text-sm font-medium dark:bg-white/5">Provider products · ranked by gross revenue</div><div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500 dark:bg-ink"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Recommendation</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2">Review</th></tr></thead><tbody className="divide-y">{products.map((product) => { const rec=product.recommendation; const stepLabel=rec ? steps.find((row)=>row.id===rec.offerStepId)?.label || rec.offerStepId : null; return <tr key={product.providerProductId} className={selectedId === product.providerProductId ? "bg-teal-50/70 dark:bg-teal-400/10" : ""}><td className="px-3 py-3"><span className="block font-medium">{product.title}</span><span className="font-mono text-xs text-slate-500">{product.providerProductId}</span></td><td className="px-3 py-3"><span className="rounded-full border px-2 py-1 text-xs">{product.mappingStatus.replaceAll("_", " ")}</span></td><td className="px-3 py-3">{rec ? <div><span className="block font-medium">{stepLabel}</span><span className="text-xs text-slate-500">{rec.confidence}% · {rec.disposition.replaceAll("_"," ")}</span></div> : <span className="text-xs text-slate-400">Manual review</span>}</td><td className="px-3 py-3 text-right tabular-nums">{number.format(product.orderCount)}</td><td className="px-3 py-3 text-right tabular-nums">{money.format(product.grossRevenue)}</td><td className="px-3 py-3"><button type="button" onClick={() => onSelect(product.providerProductId)} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-slate-950">Review</button></td></tr> })}</tbody></table></div></div>;
}

function DecisionPanel({ payload, onChanged }: { payload: Payload; onChanged: () => Promise<void> }) {
  const product = payload.products[0];
  const recommendation = product.recommendation;
  const preset = recommendation ? { businessContextId: recommendation.businessContextId, canonicalOfferId: recommendation.canonicalOfferId, offerStepId: recommendation.offerStepId, offerVariantId: recommendation.offerVariantId } : product.authorizedPreset;
  const hasPersistedTarget = product.mappingStatus === "approved" && Boolean(product.businessContextId && product.canonicalOfferId && product.offerStepId);
  const initialContextId = hasPersistedTarget ? product.businessContextId || "" : preset?.businessContextId || product.businessContextId || "";
  const initialOfferId = hasPersistedTarget ? product.canonicalOfferId || "" : preset?.canonicalOfferId || product.canonicalOfferId || "";
  const initialStepId = hasPersistedTarget ? product.offerStepId || "" : preset?.offerStepId || product.offerStepId || "";
  const initialVariantId = hasPersistedTarget ? product.offerVariantId || "" : preset?.offerVariantId || product.offerVariantId || "";
  const persistedStepLabel = product.offerStepId ? payload.targets.steps.find((row) => row.id === product.offerStepId)?.label || product.offerStepId : "None";
  const presetStepLabel = preset?.offerStepId ? payload.targets.steps.find((row) => row.id === preset.offerStepId)?.label || preset.offerStepId : null;
  const presetDiffers = Boolean(hasPersistedTarget && preset && (product.businessContextId !== preset.businessContextId || product.canonicalOfferId !== preset.canonicalOfferId || product.offerStepId !== preset.offerStepId || (product.offerVariantId || null) !== (preset.offerVariantId || null)));
  const [result, setResult] = React.useState<"approved" | "rejected">("approved");
  const [contextId, setContextId] = React.useState(initialContextId);
  const [offerId, setOfferId] = React.useState(initialOfferId);
  const [stepId, setStepId] = React.useState(initialStepId);
  const [variantId, setVariantId] = React.useState(initialVariantId);
  const [reason, setReason] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => { setResult("approved"); setContextId(initialContextId); setOfferId(initialOfferId); setStepId(initialStepId); setVariantId(initialVariantId); setReason(""); setConfirming(false); setNotice(null); }, [product.providerProductId, product.mappingVersion, initialContextId, initialOfferId, initialStepId, initialVariantId]);
  const offers = payload.targets.offers.filter((row) => row.business_context_id === contextId);
  const steps = payload.targets.steps.filter((row) => row.canonical_offer_id === offerId);
  const variants = payload.targets.variants.filter((row) => row.offer_step_id === stepId);
  const targetComplete = result === "rejected" || Boolean(contextId && offerId && stepId);

  async function submit() {
    setSubmitting(true); setNotice(null);
    const body = { providerProductId: product.providerProductId, result, expectedMappingVersion: product.mappingVersion, businessContextId: result === "approved" ? contextId : undefined, canonicalOfferId: result === "approved" ? offerId : undefined, offerStepId: result === "approved" ? stepId : undefined, offerVariantId: result === "approved" && variantId ? variantId : undefined, reason, confirmation: "confirm-product-mapping-decision" };
    try {
      const response = await fetch("/api/commerce/product-mappings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const output = await response.json() as { ok: boolean; code?: string; reload?: boolean };
      if (!response.ok || !output.ok) {
        if (output.code === "stale_mapping_version") { setNotice("This product changed while it was under review. The current state has been reloaded; review it again before submitting."); await onChanged(); return; }
        setNotice(output.code === "mapping_target_invalid" ? "The selected catalog hierarchy is no longer valid." : "The mapping decision was not saved."); return;
      }
      setNotice("Decision recorded. Alert and Operations work-item resolution is pending the next evaluator pass."); setConfirming(false); await onChanged();
    } catch { setNotice("The mapping decision was not saved."); }
    finally { setSubmitting(false); }
  }

  return <div className="space-y-4 rounded-xl border p-4"><div><h3 className="font-semibold">{product.title}</h3><div className="font-mono text-xs text-slate-500">{product.providerProductId}</div></div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><Metric label="Orders" value={number.format(product.orderCount)} /><Metric label="Gross revenue" value={money.format(product.grossRevenue)} /><Metric label="Refunds" value={`${number.format(product.refundCount)} · ${money.format(product.refundAmount)}`} /><Metric label="Observed" value={`${date(product.firstSeenAt)} – ${date(product.lastSeenAt)}`} /><Metric label="Mapping status" value={product.mappingStatus.replaceAll("_", " ")} /><Metric label="Mapping version" value={product.mappingVersion} mono /></dl>
    <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">{product.alertOpen || product.workItemOpen ? <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Open unmapped-product alert/work item</span> : <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />No open unmapped-product condition</span>}</div>
    {recommendation ? <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100"><ShieldCheck className="mr-1 inline h-4 w-4" /><strong>TraceKit recommendation:</strong> {presetStepLabel}. Confidence {recommendation.confidence}% · {recommendation.disposition.replaceAll("_"," ")} · identity {recommendation.evidence.identityMatch.replaceAll("_"," ")} · scope {recommendation.evidence.scope.replaceAll("_"," ")}.{recommendation.evidence.priceMatches.length ? <> Price evidence: {recommendation.evidence.priceMatches.map((value)=>money.format(value)).join(", ")}.</> : <> Price was not used as identity evidence.</>}</div> : null}
    {preset && !recommendation ? <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100"><ShieldCheck className="mr-1 inline h-4 w-4" />{hasPersistedTarget ? <>Authorized target: {presetStepLabel || "catalog target"}. Current persisted mapping remains selected in the form.</> : <>Operator-authorized target preselected. Explicit confirmation is still required.</>}</div> : null}
    {presetDiffers ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-400/10 dark:text-amber-100"><AlertTriangle className="mr-1 inline h-4 w-4" /><strong>Mapping mismatch:</strong> current persisted step is <strong>{persistedStepLabel}</strong>; recommended target is <strong>{presetStepLabel}</strong>. Change the form only if you intend to append a corrective decision.</div> : null}
    <fieldset className="space-y-3"><legend className="text-sm font-semibold">Decision</legend><div className="flex gap-4 text-sm"><label><input type="radio" checked={result === "approved"} onChange={() => setResult("approved")} /> Approve</label><label><input type="radio" checked={result === "rejected"} onChange={() => setResult("rejected")} /> Reject</label></div>
      {result === "approved" ? <div className="grid gap-2"><Select label="Business context" value={contextId} onChange={(v) => { setContextId(v); setOfferId(""); setStepId(""); setVariantId(""); }} rows={payload.targets.contexts} /><Select label="Canonical offer" value={offerId} onChange={(v) => { setOfferId(v); setStepId(""); setVariantId(""); }} rows={offers} /><Select label="Offer step" value={stepId} onChange={(v) => { setStepId(v); setVariantId(""); }} rows={steps} /><Select label="Variant (optional)" value={variantId} onChange={setVariantId} rows={variants} optional /></div> : <p className="text-xs text-slate-500">Rejection records no canonical target.</p>}
      <label className="block text-sm">Operator reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required className="mt-1 min-h-20 w-full rounded-lg border bg-transparent p-2" placeholder="Why is this decision authorized?" /></label>
    </fieldset>
    {!confirming ? <button type="button" disabled={!reason.trim() || !targetComplete} onClick={() => setConfirming(true)} className="w-full rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">Review decision</button> : <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-400/10"><strong>Confirm {result === "approved" ? "mapping approval" : "mapping rejection"}</strong><p>This appends an audited decision using version <span className="font-mono text-xs">{product.mappingVersion}</span>. It does not rewrite orders or resolve alerts synchronously.</p><div className="flex gap-2"><button type="button" disabled={submitting} onClick={() => void submit()} className="rounded-lg bg-amber-900 px-3 py-2 text-white disabled:opacity-50">{submitting ? "Submitting…" : "Confirm decision"}</button><button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-2">Cancel</button></div></div>}
    {notice ? <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p> : null}
    <div><h4 className="text-sm font-semibold">Decision history</h4>{payload.history.length ? <ol className="mt-2 space-y-2">{payload.history.map((item) => <li key={item.id} className="rounded-lg border p-2 text-xs"><span className="font-semibold">{item.resulting_state}</span> · {date(item.decided_at)}<div className="mt-1 text-slate-500">{item.reason}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{item.mapping_version}</div></li>)}</ol> : <p className="mt-2 text-xs text-slate-500">No mapping decisions recorded.</p>}</div>
  </div>;
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={mono ? "break-all font-mono text-xs" : "font-medium"}>{value}</dd></div>; }
function Select({ label, value, onChange, rows, optional = false }: { label: string; value: string; onChange: (value: string) => void; rows: CatalogRow[]; optional?: boolean }) { return <label className="text-sm">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-slate-950"><option value="">{optional ? "No variant" : `Select ${label.toLowerCase()}`}</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.name || row.label || row.role || row.id}</option>)}</select></label>; }
