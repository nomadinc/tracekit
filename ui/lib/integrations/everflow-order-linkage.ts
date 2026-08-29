import "server-only";
import type { CommerceControlPlane, SourceMapping } from "@/lib/commerce/control-plane";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";

const DIRECT_SOURCE_TYPE = "everflow_transaction";
const CONVERSION_SOURCE_TYPE = "everflow_conversion";
const AMOUNT_TOLERANCE = 0.01;
const EMAIL_WINDOW_WITH_AMOUNT_MS = 72 * 60 * 60 * 1000;
const EMAIL_WINDOW_WITHOUT_AMOUNT_MS = 6 * 60 * 60 * 1000;
const ORDER_SELECT = "canonical_order_id,platform_order_id,everflow_transaction_id,transaction_id,email,order_ts,gross_amount,receipt_total";

type OrderCandidate = {
  canonical_order_id?: unknown;
  platform_order_id?: unknown;
  everflow_transaction_id?: unknown;
  transaction_id?: unknown;
  email?: unknown;
  order_ts?: unknown;
  gross_amount?: unknown;
  receipt_total?: unknown;
};

type LinkagePlane = Pick<CommerceControlPlane,
  "getConnection" | "listProviderAccounts" | "resolveSourceMapping" | "createOrObserveSourceMapping"
>;

export type EverflowOrderLinkInput = {
  organizationId: string;
  connectionId: string;
  sourceRecordId: string;
  transactionId?: string | null;
  email?: string | null;
  occurredAt?: string | null;
  amount?: number | string | null;
};

export type EverflowOrderLinkResult = {
  status: "matched" | "unmatched" | "ambiguous" | "conflict";
  canonicalOrderId: string | null;
  matchMethod: "transaction_id" | "email_time_amount" | "email_time" | null;
  confidence: number;
  mappingObserved: boolean;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeEverflowTransactionId(value: unknown) {
  return text(value).replace(/^\|+|\|+$/g, "") || null;
}

export function normalizeEverflowEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function numericAmount(value: unknown) {
  if (value === null || value === undefined || text(value) === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function canonicalId(row: OrderCandidate) {
  return text(row.canonical_order_id) || null;
}

function dedupeOrders(rows: OrderCandidate[]) {
  const byId = new Map<string, OrderCandidate>();
  for (const row of rows) {
    const id = canonicalId(row);
    if (id) byId.set(id, row);
  }
  return Array.from(byId.values());
}

async function directCandidates(organizationId: string, transactionId: string) {
  const filters = `organization_id=eq.${encodeURIComponent(organizationId)}&select=${ORDER_SELECT}&limit=3`;
  const [everflowRows, transactionRows] = await Promise.all([
    commercePersistenceRequest(`platform_orders?${filters}&everflow_transaction_id=eq.${encodeURIComponent(transactionId)}`),
    commercePersistenceRequest(`platform_orders?${filters}&transaction_id=eq.${encodeURIComponent(transactionId)}`),
  ]);
  return dedupeOrders([...(everflowRows as OrderCandidate[]), ...(transactionRows as OrderCandidate[])]);
}

async function emailCandidates(input: { organizationId: string; email: string; occurredAt: string; amount: number | null }) {
  const occurredMs = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurredMs)) return [];
  const windowMs = input.amount === null ? EMAIL_WINDOW_WITHOUT_AMOUNT_MS : EMAIL_WINDOW_WITH_AMOUNT_MS;
  const from = new Date(occurredMs - windowMs).toISOString();
  const to = new Date(occurredMs + windowMs).toISOString();
  const rows = await commercePersistenceRequest(
    `platform_orders?organization_id=eq.${encodeURIComponent(input.organizationId)}` +
    `&email=ilike.${encodeURIComponent(input.email)}` +
    `&order_ts=gte.${encodeURIComponent(from)}&order_ts=lte.${encodeURIComponent(to)}` +
    `&select=${ORDER_SELECT}&order=order_ts.asc&limit=20`,
  ) as OrderCandidate[];

  return dedupeOrders(rows).filter((row) => {
    if (normalizeEverflowEmail(row.email) !== input.email) return false;
    if (input.amount === null) return true;
    const orderAmount = numericAmount(row.receipt_total ?? row.gross_amount);
    return orderAmount !== null && Math.abs(orderAmount - input.amount) <= AMOUNT_TOLERANCE;
  });
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function observeMapping(input: {
  plane: LinkagePlane;
  session: TraceKitSessionContext;
  connectionId: string;
  providerAccountId: string;
  sourceObjectType: string;
  sourceObjectId: string;
  canonicalOrderId: string;
  payloadHash: string;
}): Promise<{ mapping: SourceMapping | null; conflict: boolean }> {
  const existing = await input.plane.resolveSourceMapping(
    input.session,
    input.connectionId,
    input.providerAccountId,
    input.sourceObjectType,
    input.sourceObjectId,
  );
  if (existing && (existing.canonicalObjectType !== "order" || existing.canonicalObjectId !== input.canonicalOrderId)) {
    return { mapping: existing, conflict: true };
  }
  const mapping = await input.plane.createOrObserveSourceMapping(input.session, input.connectionId, {
    providerAccountId: input.providerAccountId,
    sourceObjectType: input.sourceObjectType,
    sourceObjectId: input.sourceObjectId,
    canonicalObjectType: "order",
    canonicalObjectId: input.canonicalOrderId,
    payloadHash: input.payloadHash,
    lastSeenAt: new Date().toISOString(),
  });
  return { mapping, conflict: false };
}

export async function resolveAndMapEverflowOrder(input: {
  plane: LinkagePlane;
  session: TraceKitSessionContext;
  link: EverflowOrderLinkInput;
}): Promise<EverflowOrderLinkResult> {
  const sourceRecordId = text(input.link.sourceRecordId);
  if (!sourceRecordId) throw new Error("Everflow source record identity is required.");
  const connection = await input.plane.getConnection(input.session, input.link.connectionId);
  if (connection.organizationId !== input.link.organizationId || connection.provider !== "everflow" || connection.status === "revoked") {
    throw new Error("Everflow connection is unavailable.");
  }
  const accounts = await input.plane.listProviderAccounts(input.session, input.link.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");

  const transactionId = normalizeEverflowTransactionId(input.link.transactionId);
  const email = normalizeEverflowEmail(input.link.email);
  const amount = numericAmount(input.link.amount);
  let candidates: OrderCandidate[] = [];
  let method: EverflowOrderLinkResult["matchMethod"] = null;
  let confidence = 0;

  if (transactionId) {
    candidates = await directCandidates(input.link.organizationId, transactionId);
    if (candidates.length === 1) {
      method = "transaction_id";
      confidence = 1;
    } else if (candidates.length > 1) {
      return { status: "ambiguous", canonicalOrderId: null, matchMethod: "transaction_id", confidence: 0, mappingObserved: false };
    }
  }

  if (!method && email && input.link.occurredAt) {
    candidates = await emailCandidates({ organizationId: input.link.organizationId, email, occurredAt: input.link.occurredAt, amount });
    if (candidates.length === 1) {
      method = amount === null ? "email_time" : "email_time_amount";
      confidence = amount === null ? 0.65 : 0.85;
    } else if (candidates.length > 1) {
      return { status: "ambiguous", canonicalOrderId: null, matchMethod: amount === null ? "email_time" : "email_time_amount", confidence: 0, mappingObserved: false };
    }
  }

  if (!method || candidates.length !== 1) {
    return { status: "unmatched", canonicalOrderId: null, matchMethod: null, confidence: 0, mappingObserved: false };
  }

  const canonicalOrderId = canonicalId(candidates[0]);
  if (!canonicalOrderId) return { status: "unmatched", canonicalOrderId: null, matchMethod: null, confidence: 0, mappingObserved: false };
  const payloadHash = await sha256({ sourceRecordId, transactionId, email, occurredAt: input.link.occurredAt || null, amount, canonicalOrderId, method });

  const sourceObserved = await observeMapping({
    plane: input.plane,
    session: input.session,
    connectionId: input.link.connectionId,
    providerAccountId: account.id,
    sourceObjectType: CONVERSION_SOURCE_TYPE,
    sourceObjectId: sourceRecordId,
    canonicalOrderId,
    payloadHash,
  });
  if (sourceObserved.conflict) return { status: "conflict", canonicalOrderId: null, matchMethod: method, confidence: 0, mappingObserved: false };

  if (transactionId && method === "transaction_id") {
    const transactionObserved = await observeMapping({
      plane: input.plane,
      session: input.session,
      connectionId: input.link.connectionId,
      providerAccountId: account.id,
      sourceObjectType: DIRECT_SOURCE_TYPE,
      sourceObjectId: transactionId,
      canonicalOrderId,
      payloadHash,
    });
    if (transactionObserved.conflict) return { status: "conflict", canonicalOrderId: null, matchMethod: method, confidence: 0, mappingObserved: false };
  }

  return { status: "matched", canonicalOrderId, matchMethod: method, confidence, mappingObserved: true };
}
