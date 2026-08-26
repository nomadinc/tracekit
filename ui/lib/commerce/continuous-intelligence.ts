import { createHash } from "node:crypto";

export const CONTINUOUS_NORMALIZER_VERSION = "commas-transaction-v1";
export const COMMERCE_EVIDENCE_CONTRACT_VERSION = "commerce-provider-raw-v1";
export const DEFAULT_OVERLAP_PAGES = 3;
export const STABLE_KNOWN_PAGES_REQUIRED = 2;

export type SourceChange = "new" | "source_changed" | "source_identical" | "normalizer_changed";
export type ProviderOrdering = "newest_first" | "oldest_first" | "unstable" | "unknown";
export type PaginationClassification = "none" | "benign_boundary_overlap" | "pagination_instability";
export type AttributionAvailability = "attribution_source_available" | "attribution_source_unavailable" | "eligible_unattributed" | "outside_source_evidence";

export type PageObservation = {
  page: number;
  totalPages: number | null;
  totalItems: number | null;
  ids: string[];
  timestamps: string[];
  fingerprint: string;
  knownIds: Set<string>;
  priorFingerprint?: string | null;
};

export type StabilityState = {
  consecutiveStableKnownPages: number;
  pagesScanned: number;
  unseenRecords: number;
  changedRecords: number;
  pageShiftDetected: boolean;
};

export type OrderingPageObservation = {
  page: number;
  direction: ProviderOrdering;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  firstSourceId: string | null;
  lastSourceId: string | null;
  ids: string[];
  fingerprint?: string | null;
};

export type OrderingObserverState = {
  ordering: ProviderOrdering;
  pagesObserved: number;
  boundaryOverlapCount: number;
  paginationClassification: PaginationClassification;
  pageShiftDetected: boolean;
  previous: OrderingPageObservation | null;
};

export function initialOrderingObserver(): OrderingObserverState {
  return { ordering: "unknown", pagesObserved: 0, boundaryOverlapCount: 0, paginationClassification: "none", pageShiftDetected: false, previous: null };
}

export function observeOrderingPage(state: OrderingObserverState, current: OrderingPageObservation, maxBoundaryOverlap = 1): OrderingObserverState {
  const duplicateIds = current.ids.filter((id, index) => current.ids.indexOf(id) !== index);
  let classification: PaginationClassification = duplicateIds.length > 0 ? "pagination_instability" : state.paginationClassification;
  let boundaryOverlapCount = state.boundaryOverlapCount;
  let crossPageUnsafe = false;
  const previous = state.previous;
  if (previous && current.page === previous.page + 1) {
    const repeated = current.ids.filter((id) => previous.ids.includes(id));
    const boundary = previous.lastSourceId !== null && current.firstSourceId === previous.lastSourceId && repeated.length === 1 ? 1 : 0;
    const nonBoundary = repeated.length - boundary;
    if (duplicateIds.length > 0 || nonBoundary > 0 || boundary > maxBoundaryOverlap) classification = "pagination_instability";
    else if (boundary > 0) { boundaryOverlapCount += boundary; classification = "benign_boundary_overlap"; }
    const before = previous.lastTimestamp ? Date.parse(previous.lastTimestamp) : NaN;
    const after = current.firstTimestamp ? Date.parse(current.firstTimestamp) : NaN;
    if (!Number.isFinite(before) || !Number.isFinite(after)) crossPageUnsafe = true;
    else if (state.ordering === "newest_first" && after > before) crossPageUnsafe = true;
    else if (state.ordering === "oldest_first" && after < before) crossPageUnsafe = true;
  }
  const direction = current.direction;
  const firstPageUnknown = state.pagesObserved === 1 && state.ordering === "unknown";
  if (crossPageUnsafe) classification = "pagination_instability";
  const ordering = classification === "pagination_instability" || crossPageUnsafe || direction === "unstable" || firstPageUnknown
    ? "unstable"
    : state.pagesObserved === 0 ? direction
      : state.ordering === "unknown" ? direction
        : direction === "unknown" || state.ordering !== direction ? "unstable" : state.ordering;
  return {
    ordering,
    pagesObserved: state.pagesObserved + 1,
    boundaryOverlapCount,
    paginationClassification: classification,
    pageShiftDetected: state.pageShiftDetected || crossPageUnsafe,
    previous: current,
  };
}

type Json = Record<string, unknown>;
const asObject=(value:unknown):Json|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Json:null;
const asNumber=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};

export function parseContinuousPage(bytes:Uint8Array) {
  const root=JSON.parse(new TextDecoder().decode(bytes)) as Json;
  const nested=asObject(root.data);
  const items=[root.transactions,root.data,root.items,nested?.transactions,nested?.data].find(Array.isArray) as Json[]|undefined;
  if(!items||items.some((item)=>!asObject(item)||item.id==null||item.transaction_date==null)) throw new Error("Unexpected Commas Transaction page schema.");
  const pagination=asObject(nested?.pagination)||asObject(root.pagination)||asObject(root.meta)||nested||{};
  const currentPage=asNumber(pagination.current_page??pagination.currentPage)??1;
  const totalPages=asNumber(pagination.total_pages??pagination.last_page??pagination.totalPages);
  const totalItems=asNumber(pagination.total_items??pagination.total??pagination.totalItems);
  const explicit=pagination.has_more??pagination.has_next_page??pagination.hasMore;
  const hasMore=typeof explicit==="boolean"?explicit:totalPages!==null?currentPage<totalPages:Boolean(pagination.next_page_url);
  return {items,currentPage,totalPages,totalItems,hasMore};
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function contentFingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function detectProviderOrdering(timestamps: string[]): ProviderOrdering {
  const values = timestamps.map((value) => Date.parse(value));
  if (values.length < 2 || values.some(Number.isNaN)) return "unknown";
  let ascending = true, descending = true;
  for (let index=1; index<values.length; index++) {
    if (values[index] < values[index-1]) ascending = false;
    if (values[index] > values[index-1]) descending = false;
  }
  if (descending && !ascending) return "newest_first";
  if (ascending && !descending) return "oldest_first";
  if (ascending && descending) return "unknown";
  return "unstable";
}

export function firstContinuousPages(ordering: ProviderOrdering, totalPages: number | null, overlapPages=DEFAULT_OVERLAP_PAGES) {
  if (ordering === "newest_first") return Array.from({length: Math.max(1,overlapPages)},(_,index)=>index+1);
  if (ordering === "oldest_first" && totalPages) {
    const start=Math.max(1,totalPages-Math.max(1,overlapPages)+1);
    return Array.from({length:totalPages-start+1},(_,index)=>start+index);
  }
  return [1];
}

export function classifySource(input: { priorPayloadHash?: string | null; nextPayloadHash: string; priorNormalizerVersion?: string | null; nextNormalizerVersion: string }): SourceChange {
  if (!input.priorPayloadHash) return "new";
  if (input.priorPayloadHash !== input.nextPayloadHash) return "source_changed";
  if (input.priorNormalizerVersion && input.priorNormalizerVersion !== input.nextNormalizerVersion) return "normalizer_changed";
  return "source_identical";
}

export function advanceStability(state: StabilityState, observation: PageObservation, sourceChanges: SourceChange[]): StabilityState {
  const unseen=sourceChanges.filter((value)=>value==="new").length;
  const changed=sourceChanges.filter((value)=>value==="source_changed"||value==="normalizer_changed").length;
  const allKnown=observation.ids.length>0 && observation.ids.every((id)=>observation.knownIds.has(id));
  const fingerprintMoved=Boolean(observation.priorFingerprint && observation.priorFingerprint!==observation.fingerprint);
  const stable=allKnown && unseen===0 && changed===0;
  return {
    consecutiveStableKnownPages: stable ? state.consecutiveStableKnownPages+1 : 0,
    pagesScanned: state.pagesScanned+1,
    unseenRecords: state.unseenRecords+unseen,
    changedRecords: state.changedRecords+changed,
    pageShiftDetected: state.pageShiftDetected || (fingerprintMoved && allKnown),
  };
}

export function continuousStopDecision(input: { state: StabilityState; ordering: ProviderOrdering; page: number; totalPages: number | null; maxPages: number; rateLimitRemaining: number | null }) {
  if (input.ordering === "unstable" || input.ordering === "unknown") return { stop:true, reason:"provider_ordering_unverified", deeperReconciliationRequired:true };
  if (input.rateLimitRemaining!==null && input.rateLimitRemaining<100) return { stop:true, reason:"rate_limit_safety_boundary", deeperReconciliationRequired:true };
  if (input.state.consecutiveStableKnownPages>=STABLE_KNOWN_PAGES_REQUIRED) return { stop:true, reason:"stable_known_boundary", deeperReconciliationRequired:input.state.pageShiftDetected };
  if (input.page>=input.maxPages) return { stop:true, reason:"bounded_scan_limit", deeperReconciliationRequired:true };
  if (input.totalPages!==null && input.page>=input.totalPages) return { stop:true, reason:"provider_history_boundary", deeperReconciliationRequired:false };
  return { stop:false, reason:null, deeperReconciliationRequired:false };
}

export function attributionAvailability(input: { orderAt: string; sourceStart?: string | null; sourceEnd?: string | null; liveSourceAvailable: boolean; attributed: boolean }): AttributionAvailability {
  if (!input.liveSourceAvailable) return "attribution_source_unavailable";
  const order=Date.parse(input.orderAt),start=input.sourceStart?Date.parse(input.sourceStart):null,end=input.sourceEnd?Date.parse(input.sourceEnd):null;
  if ((start!==null && order<start)||(end!==null && order>end)) return "outside_source_evidence";
  return input.attributed ? "attribution_source_available" : "eligible_unattributed";
}

export function rateLimitDelay(input: { status: number; retryAfterSeconds?: number | null; remaining?: number | null; attempt: number }) {
  if (input.status===429 && input.retryAfterSeconds && input.retryAfterSeconds>0) return Math.min(input.retryAfterSeconds*1000,60_000);
  if (input.remaining!==null && input.remaining!==undefined && input.remaining<100) return 5_000;
  return Math.min(500*2**Math.max(0,input.attempt-1),5_000);
}

export function continuousRequestBounds(input: { bootstrap?: boolean; mode: "continuous"|"deep_reconciliation"; maxPages?: number; perPage?: number; overlapPages?: number }) {
  if (input.bootstrap && input.mode !== "continuous") throw new Error("Quota bootstrap supports continuous mode only.");
  const bootstrap = input.bootstrap === true;
  return {
    perPage: bootstrap ? 1 : input.perPage ?? 100,
    maxPages: bootstrap ? 1 : input.mode === "deep_reconciliation" ? input.maxPages ?? Number.MAX_SAFE_INTEGER : input.maxPages ?? 8,
    overlapPages: bootstrap ? 1 : input.overlapPages ?? DEFAULT_OVERLAP_PAGES,
  };
}

export function candidateKey(input: { organizationId: string; candidateType: string; metric: string; entityType?: string | null; entityId?: string | null; periodStart?: string | null; periodEnd?: string | null; baselineVersion: string }) {
  return contentFingerprint({organizationId:input.organizationId,candidateType:input.candidateType,metric:input.metric,entityType:input.entityType??null,entityId:input.entityId??null,periodStart:input.periodStart??null,periodEnd:input.periodEnd??null,baselineVersion:input.baselineVersion});
}

export function evaluateRateCandidate(input: { currentRate: number; baselineRate: number; sampleSize: number; mature: boolean; minimumSample?: number; minimumAbsoluteDelta?: number; existingInvestigation?: boolean }) {
  const minimumSample=input.minimumSample??100, minimumDelta=input.minimumAbsoluteDelta??0.03;
  if (input.existingInvestigation) return {create:false,reason:"existing_investigation_covers_signal"};
  if (!input.mature) return {create:false,reason:"cohort_immature"};
  if (input.sampleSize<minimumSample) return {create:false,reason:"sample_too_small"};
  if (input.currentRate-input.baselineRate<minimumDelta) return {create:false,reason:"movement_below_threshold"};
  return {create:true,reason:"mature_rate_above_baseline"};
}
