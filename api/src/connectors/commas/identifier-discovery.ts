import type { CommasTransaction } from "./types.ts";

const TARGET_KEYS = [
  "c1", "c2", "c3", "c4", "c5", "tid", "transaction_id", "_ef_transaction_id",
  "everflow_transaction_id", "affiliate_id", "affid", "source_id", "sub1", "sub2", "sub3",
  "sub4", "sub5", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ttclid", "msclkid", "click_id", "clickid", "external_id", "session_id",
  "checkout_session_id", "order_id", "customer_id", "referrer", "landing_page", "landing_url",
  "checkout_url", "payment_link", "campaign", "adset", "ad", "creative", "metadata",
  "custom_fields", "query_params", "url_params", "tracking", "attribution",
] as const;

const DISPUTE_KEYS = [
  "dispute", "disputes", "chargeback", "chargebacks", "reversal", "reversals", "representment",
  "won", "lost", "reason", "reason_code", "dispute_status", "chargeback_fee", "evidence", "due_date",
  "processor_dispute", "processor_dispute_id",
] as const;
const STRONG_DISPUTE_KEYS = new Set(["dispute", "disputes", "chargeback", "chargebacks", "reversal", "reversals", "representment", "dispute_status", "chargeback_fee", "processor_dispute", "processor_dispute_id"].map(normalizeKey));
const CANDIDATE_KEY = /(?:affiliate|attribut|campaign|checkout|click|creative|custom|dispute|evidence|external|identifier|landing|metadata|order|query|reason|referr|representment|reversal|session|source|track|transaction|url|utm|chargeback|(?:^|_)id$)/i;
const MAX_JSON_STRING_LENGTH = 4_096;
const MAX_DEPTH = 12;
const MAX_NODES = 10_000;

export type CommasIdentifierSurface = {
  account: "small" | "main" | "synthetic";
  sample: { transactionCount: number; pagesScanned: number; pageCap: number; nestedJsonMaximumBytes: number };
  exactMatchedFieldPaths: string[];
  exactMatchedFieldTypes: Array<{ path: string; types: string[] }>;
  structurallySimilarCandidateFieldPaths: string[];
  presentButEmptyOrNullFieldPaths: string[];
  fieldsNotObserved: string[];
  externalAttributionIdentifiersObserved: boolean;
  checkoutReferenceAssessment: "payment_link_only" | "additional_checkout_references_observed" | "no_checkout_reference_observed";
  disputeSurface: {
    matchedFieldPaths: string[];
    candidateFieldPaths: string[];
    pollingEndpointStatus: "not_documented";
    conclusion: "webhook_or_provider_support_dependent" | "transaction_structure_observed";
  };
  limitsReached: boolean;
};

export function discoverCommasIdentifierSurface(
  transactions: CommasTransaction[],
  options: { account?: "small" | "main" | "synthetic"; pagesScanned?: number; pageCap?: number } = {},
): CommasIdentifierSurface {
  const targetByNormalized = new Map(TARGET_KEYS.map((key) => [normalizeKey(key), key]));
  const disputeNormalized = new Set(DISPUTE_KEYS.map(normalizeKey));
  const exact = new Set<string>();
  const candidates = new Set<string>();
  const exactTypes = new Map<string, Set<string>>();
  const empty = new Set<string>();
  const disputes = new Set<string>();
  const disputeCandidates = new Set<string>();
  const strongDisputes = new Set<string>();
  const observedTargets = new Set<string>();
  let nodes = 0;
  let limitsReached = false;

  const visit = (value: unknown, path: string, depth: number) => {
    if (nodes >= MAX_NODES || depth > MAX_DEPTH) {
      limitsReached = true;
      return;
    }
    nodes += 1;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, `${path}[]`, depth + 1);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const safeKey = safePathSegment(key);
        const childPath = path ? `${path}.${safeKey}` : safeKey;
        const normalized = normalizeKey(key);
        const canonical = targetByNormalized.get(normalized);
        if (canonical) {
          exact.add(childPath);
          const types = exactTypes.get(childPath) ?? new Set<string>();
          types.add(jsonType(child));
          exactTypes.set(childPath, types);
          observedTargets.add(canonical);
          if (isEmpty(child)) empty.add(childPath);
        } else if (CANDIDATE_KEY.test(key)) {
          candidates.add(childPath);
          if (isEmpty(child)) empty.add(childPath);
        }
        if (disputeNormalized.has(normalized)) {
          disputes.add(childPath);
          if (STRONG_DISPUTE_KEYS.has(normalized)) strongDisputes.add(childPath);
          if (isEmpty(child)) empty.add(childPath);
        } else if (/(?:dispute|chargeback|reversal)/i.test(key)) {
          disputeCandidates.add(childPath);
        }
        visit(child, childPath, depth + 1);
      }
      return;
    }
    if (typeof value === "string" && value.length <= MAX_JSON_STRING_LENGTH && /^\s*[\[{]/.test(value)) {
      try {
        visit(JSON.parse(value), `${path}.$json`, depth + 1);
      } catch {
        // Non-JSON strings are intentionally ignored and never emitted.
      }
    }
  };

  for (const transaction of transactions) visit(transaction, "transaction", 0);

  const checkoutTargets = new Set(["checkout_session_id", "checkout_url", "payment_link", "session_id"]);
  const observedCheckout = [...observedTargets].filter((key) => checkoutTargets.has(key));
  const externalTargets = new Set([
    "c1", "c2", "c3", "c4", "c5", "tid", "_ef_transaction_id", "everflow_transaction_id",
    "affiliate_id", "affid", "source_id", "sub1", "sub2", "sub3", "sub4", "sub5", "utm_source",
    "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ttclid", "msclkid",
    "click_id", "clickid", "external_id", "referrer", "campaign", "adset", "ad", "creative", "tracking", "attribution",
  ]);
  const externalAttributionIdentifiersObserved = [...observedTargets].some((key) => externalTargets.has(key));

  return {
    account: options.account ?? "synthetic",
    sample: {
      transactionCount: transactions.length,
      pagesScanned: options.pagesScanned ?? 2,
      pageCap: options.pageCap ?? options.pagesScanned ?? 2,
      nestedJsonMaximumBytes: MAX_JSON_STRING_LENGTH,
    },
    exactMatchedFieldPaths: [...exact].sort(),
    exactMatchedFieldTypes: [...exactTypes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, types]) => ({ path, types: [...types].sort() })),
    structurallySimilarCandidateFieldPaths: [...candidates].sort(),
    presentButEmptyOrNullFieldPaths: [...empty].sort(),
    fieldsNotObserved: TARGET_KEYS.filter((key) => !observedTargets.has(key)),
    externalAttributionIdentifiersObserved,
    checkoutReferenceAssessment: observedCheckout.length === 0
      ? "no_checkout_reference_observed"
      : observedCheckout.every((key) => key === "payment_link")
        ? "payment_link_only"
        : "additional_checkout_references_observed",
    disputeSurface: {
      matchedFieldPaths: [...disputes].sort(),
      candidateFieldPaths: [...disputeCandidates].sort(),
      pollingEndpointStatus: "not_documented",
      conclusion: strongDisputes.size ? "transaction_structure_observed" : "webhook_or_provider_support_dependent",
    },
    limitsReached,
  };
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safePathSegment(value: string) {
  if (/@|https?:|\b\+?\d[\d(). -]{7,}\d\b/i.test(value)) return "<redacted-key>";
  return value.slice(0, 120);
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value as object).length === 0;
}

function jsonType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}
