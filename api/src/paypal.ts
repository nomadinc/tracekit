export type PaypalEnvironment = "sandbox" | "live";

export type PaypalCapabilityStatus = {
  transaction_reporting: boolean;
  disputes: boolean;
  fees: boolean;
  webhooks: boolean;
  warnings: string[];
};

export type PaypalCredentialMetadata = {
  environment: PaypalEnvironment;
  merchant_account_id?: string | null;
  webhook_id?: string | null;
  last_successful_sync_at?: string | null;
  connector_label?: string | null;
  connector_id?: string | null;
  capabilities?: Partial<PaypalCapabilityStatus>;
};

export type PaypalAccessToken = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  app_id?: string;
  scope?: string;
  raw: any;
};

export type PaypalMoney = {
  value: number;
  currency: string;
};

export type PaypalTransactionWindow = {
  from: string;
  to: string;
  startIso: string;
  endIso: string;
};

export type PaypalLedgerType =
  | "sale"
  | "refund"
  | "chargeback"
  | "chargeback_fee"
  | "processor_fee"
  | "reversal"
  | "adjustment";

export type PaypalLedgerEvent = {
  ledgerType: PaypalLedgerType;
  transactionId: string;
  parentTransactionId?: string | null;
  amount: number;
  currency: string;
  status: string;
  reason: string;
  occurredAt: string;
  orderId: string | null;
  connectorId: string;
  accountId: string;
  raw: any;
};

export type PaypalCommerceOrderCandidate = {
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  commerce_reference?: string | null;
  transaction_id?: string | null;
  customer_email?: string | null;
  customer_email_normalized?: string | null;
  email?: string | null;
  phone?: string | null;
  gross_amount?: number | string | null;
  currency?: string | null;
  order_ts?: string | null;
};

export type PaypalMatchedTransaction = {
  transaction_id?: string | null;
  parent_transaction_id?: string | null;
  matched_platform_order_id?: string | null;
  matched_order_id?: string | null;
  match_confidence?: number | string | null;
};

export type PaypalReconciliationResult = {
  matched: boolean;
  ambiguous: boolean;
  matched_platform_order_id: string | null;
  matched_order_id: string | null;
  match_method: string | null;
  match_confidence: number | null;
  match_reason: string;
  match_candidate_count: number;
};

export type PaypalPaymentTransactionCommerceReferenceRow = {
  id?: string | null;
  transaction_id?: string | null;
  commerce_reference?: string | null;
  matched_platform_order_id?: string | null;
  matched_order_id?: string | null;
};

export type PaypalChunkLookupKeys = {
  transactionIds: string[];
  parentTransactionIds: string[];
  commerceReferences: string[];
  referenceIds: string[];
  merchantOrderIds: string[];
  emails: string[];
  phones: string[];
  currencies: string[];
  occurredAt: string[];
  fromIso: string | null;
  toIso: string | null;
};

export type PaypalBulkLookupQueryPlan = {
  paymentTransactionParentQueries: number;
  platformOrderReferenceQueries: number;
  platformOrderTransactionQueries: number;
  platformOrderEmailQueries: number;
  platformOrderPhoneQueries: number;
  phoneMatchingDeferred: number;
  duplicateSaleQueries: number;
};

export type PaypalPhoneMatchingSummary = {
  phone_matching_attempted: number;
  phone_matching_skipped: number;
  phone_matching_deferred: number;
  phone_match_warnings: string[];
};

export type PaypalReconciliationLookupWarningKind =
  | "commerce_reference_lookup_deferred"
  | "commerce_transaction_lookup_deferred"
  | "commerce_email_lookup_deferred";

export type PaypalPlatformOrderDedupeResult = {
  rows: any[];
  generated: number;
  deduplicated: number;
  skippedNoReference: number;
};

export type PaypalCommerceReferenceEvidence = {
  value: string;
  source_type: string;
  candidates: Array<{
    source_type: string;
    value: string;
  }>;
};

export const PAYPAL_BASE_URLS: Record<PaypalEnvironment, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

const PAYPAL_MAX_TRANSACTION_WINDOW_DAYS = 31;
const PAYPAL_MAX_PAGE_SIZE = 500;
const DEFAULT_TIMEOUT_MS = 30000;

const PAYPAL_SALE_EVENT_CODES = new Set([
  "T0006",
  "T0007",
  "T0011",
  "T0012",
  "T0013",
]);

const PAYPAL_REFUND_EVENT_CODES = new Set(["T1107"]);
const PAYPAL_REVERSAL_EVENT_CODES = new Set(["T1100", "T1101", "T1102", "T1103", "T1104", "T1105", "T1106", "T1108"]);
const PAYPAL_ADJUSTMENT_EVENT_CODES = new Set(["T1200", "T1201"]);

export class PaypalApiError extends Error {
  code: string;
  status: number;
  capability?: "oauth" | "transaction_reporting" | "disputes" | "upstream";

  constructor(args: { code: string; message: string; status: number; capability?: PaypalApiError["capability"] }) {
    super(args.message);
    this.name = "PaypalApiError";
    this.code = args.code;
    this.status = args.status;
    this.capability = args.capability;
  }
}

export function normalizePaypalEnvironment(value: unknown): PaypalEnvironment | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "sandbox" || raw === "live") return raw;
  return null;
}

export function paypalBaseUrlForEnvironment(value: unknown) {
  const environment = normalizePaypalEnvironment(value);
  if (!environment) throw new Error("PayPal environment must be sandbox or live.");
  return PAYPAL_BASE_URLS[environment];
}

export function normalizePaypalCredentialMetadata(value: unknown): PaypalCredentialMetadata {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
  const environment = normalizePaypalEnvironment(raw.environment) || "sandbox";
  return {
    environment,
    merchant_account_id: cleanText(raw.merchant_account_id) || null,
    webhook_id: cleanText(raw.webhook_id) || null,
    last_successful_sync_at: cleanText(raw.last_successful_sync_at) || null,
    connector_label: cleanText(raw.connector_label) || null,
    connector_id: cleanText(raw.connector_id) || null,
    capabilities: raw.capabilities && typeof raw.capabilities === "object" ? raw.capabilities : undefined,
  };
}

export function stablePaypalConnectorId(args: { merchantAccountId?: unknown; clientId?: unknown }) {
  const merchant = normalizeIdPart(args.merchantAccountId);
  if (merchant) return `paypal:${merchant}`;

  const clientId = String(args.clientId ?? "").trim().toLowerCase();
  const hash = fnv1aHash(clientId || "unknown");
  return `paypal:client_${hash}`;
}

export function maskPaypalClientId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 10) return `${raw.slice(0, 2)}...${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

export function splitPaypalDateRange(from: string, to: string, maxDays = PAYPAL_MAX_TRANSACTION_WINDOW_DAYS): PaypalTransactionWindow[] {
  const start = parseYmd(from);
  const inclusiveEnd = parseYmd(to);
  if (!start || !inclusiveEnd) throw new Error("from/to must be YYYY-MM-DD");
  if (inclusiveEnd.getTime() < start.getTime()) throw new Error("to must be on or after from");

  const windows: PaypalTransactionWindow[] = [];
  const finalEnd = addDaysUTC(inclusiveEnd, 1);
  let cursor = start;

  while (cursor.getTime() < finalEnd.getTime()) {
    const next = minDate(addDaysUTC(cursor, maxDays), finalEnd);
    windows.push({
      from: isoYmdUTC(cursor),
      to: isoYmdUTC(addDaysUTC(next, -1)),
      startIso: cursor.toISOString(),
      endIso: next.toISOString(),
    });
    cursor = next;
  }

  return windows;
}

export function buildPaypalTransactionSearchUrl(args: {
  baseUrl: string;
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
}) {
  const url = new URL(`${args.baseUrl.replace(/\/+$/, "")}/v1/reporting/transactions`);
  url.searchParams.set("start_date", args.startDate);
  url.searchParams.set("end_date", args.endDate);
  url.searchParams.set("fields", "all");
  url.searchParams.set("balance_affecting_records_only", "Y");
  url.searchParams.set("page_size", String(Math.max(1, Math.min(PAYPAL_MAX_PAGE_SIZE, Number(args.pageSize ?? PAYPAL_MAX_PAGE_SIZE)))));
  url.searchParams.set("page", String(Math.max(1, Number(args.page ?? 1))));
  return url;
}

export async function fetchPaypalAccessToken(args: {
  environment: PaypalEnvironment;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<PaypalAccessToken> {
  const baseUrl = paypalBaseUrlForEnvironment(args.environment);
  const fetcher = args.fetchImpl ?? fetch;
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

  const res = await fetchWithTimeout(
    fetcher,
    `${baseUrl}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${args.clientId}:${args.clientSecret}`)}`,
      },
      body: body.toString(),
    },
    args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const text = await readTextSafe(res);
  const parsed = safeJsonParse(text);

  if (!res.ok || !parsed?.access_token) {
    throw paypalErrorFromResponse(res.status, text, parsed, "oauth");
  }

  return {
    access_token: String(parsed.access_token),
    token_type: parsed.token_type ? String(parsed.token_type) : undefined,
    expires_in: Number.isFinite(Number(parsed.expires_in)) ? Number(parsed.expires_in) : undefined,
    app_id: parsed.app_id ? String(parsed.app_id) : undefined,
    scope: parsed.scope ? String(parsed.scope) : undefined,
    raw: parsed,
  };
}

export async function fetchPaypalTransactionPage(args: {
  baseUrl: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const url = buildPaypalTransactionSearchUrl(args);
  return paypalJsonRequest({
    url: url.toString(),
    accessToken: args.accessToken,
    capability: "transaction_reporting",
    fetchImpl: args.fetchImpl,
    timeoutMs: args.timeoutMs,
  });
}

export async function fetchAllPaypalTransactions(args: {
  baseUrl: string;
  accessToken: string;
  windows: PaypalTransactionWindow[];
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onPage?: (page: { window: PaypalTransactionWindow; page: number; fetched: number; totalPages: number }) => void | Promise<void>;
}) {
  const records: any[] = [];
  let pages = 0;

  for (const window of args.windows) {
    let page = 1;
    for (;;) {
      const parsed = await fetchPaypalTransactionPage({
        baseUrl: args.baseUrl,
        accessToken: args.accessToken,
        startDate: window.startIso,
        endDate: window.endIso,
        page,
        pageSize: args.pageSize ?? PAYPAL_MAX_PAGE_SIZE,
        fetchImpl: args.fetchImpl,
        timeoutMs: args.timeoutMs,
      });

      const pageRecords = paypalTransactionDetails(parsed);
      records.push(...pageRecords);
      pages += 1;

      const totalPages = Math.max(1, Number(parsed?.total_pages ?? parsed?.totalPages ?? page));
      await args.onPage?.({ window, page, fetched: pageRecords.length, totalPages });

      if (!pageRecords.length || page >= totalPages) break;
      page += 1;
    }
  }

  return { records, pages };
}

export async function testPaypalConnection(args: {
  environment: PaypalEnvironment;
  clientId: string;
  clientSecret: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}) {
  const baseUrl = paypalBaseUrlForEnvironment(args.environment);
  const token = await fetchPaypalAccessToken({
    environment: args.environment,
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    fetchImpl: args.fetchImpl,
    timeoutMs: 15000,
  });

  const now = args.now ?? new Date();
  const start = new Date(now.getTime() - 24 * 3600000);
  const report = await fetchPaypalTransactionPage({
    baseUrl,
    accessToken: token.access_token,
    startDate: start.toISOString(),
    endDate: now.toISOString(),
    page: 1,
    pageSize: 1,
    fetchImpl: args.fetchImpl,
    timeoutMs: 15000,
  });

  const records = paypalTransactionDetails(report);
  const merchantAccountId = records.map((record) => extractPaypalAccountId(record)).find(Boolean) || null;
  const warnings: string[] = [];
  let disputes = false;

  try {
    await paypalJsonRequest({
      url: `${baseUrl}/v1/customer/disputes?page_size=1`,
      accessToken: token.access_token,
      capability: "disputes",
      fetchImpl: args.fetchImpl,
      timeoutMs: 15000,
    });
    disputes = true;
  } catch (error) {
    if (error instanceof PaypalApiError && (error.status === 403 || error.status === 404)) {
      warnings.push("PayPal disputes capability is unavailable for these credentials/scopes.");
    } else if (error instanceof PaypalApiError && error.status === 429) {
      warnings.push("PayPal disputes capability could not be checked because PayPal rate limited the request.");
    } else {
      warnings.push("PayPal disputes capability could not be confirmed.");
    }
  }

  return {
    ok: true,
    message: warnings.length
      ? "PayPal connection successful with capability warnings."
      : "PayPal connection successful.",
    environment: args.environment,
    baseUrl,
    merchant_account_id: merchantAccountId,
    capabilities: {
      transaction_reporting: true,
      disputes,
      fees: true,
      webhooks: false,
      warnings,
    } satisfies PaypalCapabilityStatus,
  };
}

export function paypalTransactionDetails(response: any): any[] {
  if (Array.isArray(response?.transaction_details)) return response.transaction_details;
  if (Array.isArray(response?.transactionDetails)) return response.transactionDetails;
  if (Array.isArray(response?.transactions)) return response.transactions;
  if (Array.isArray(response)) return response;
  return [];
}

export function reconcilePaypalRecordToCommerceOrder(args: {
  record: any;
  candidates: PaypalCommerceOrderCandidate[];
  linkedPaypalTransactions?: PaypalMatchedTransaction[];
}): PaypalReconciliationResult {
  const fields = paypalRecordMatchingFields(args.record);
  const candidates = dedupeCandidates(args.candidates);
  const ledgerType = classifyPaypalLedgerEvent(args.record);

  if (ledgerType && ledgerType !== "sale") {
    const parentMatch = resolveLinkedPaypalMatch(fields.parentTransactionIds, args.linkedPaypalTransactions || []);
    if (parentMatch) return parentMatch;
  }

  const tiers: Array<{ method: string; confidence: number; reason: string; candidates: PaypalCommerceOrderCandidate[] }> = [
    {
      method: "commerce_reference_exact",
      confidence: 100,
      reason: "Exact PayPal commerce reference matched a commerce order commerce_reference.",
      candidates: candidates.filter((candidate) => candidateMatchesCommerceReference(candidate, fields.commerceReference)),
    },
    {
      method: "exact_reference",
      confidence: 100,
      reason: "Exact PayPal merchant order, invoice, custom, or reference ID matched a commerce order.",
      candidates: candidates.filter((candidate) => candidateMatchesReference(candidate, fields.referenceIds)),
    },
    {
      method: "paypal_transaction_id",
      confidence: 95,
      reason: "Exact PayPal transaction ID matched a transaction ID already stored on a commerce order.",
      candidates: candidates.filter((candidate) => idsEqual(candidate.transaction_id, fields.transactionId)),
    },
    {
      method: "email_amount_currency_2h",
      confidence: 85,
      reason: "Normalized email, exact amount, currency, and order time within 2 hours matched.",
      candidates: candidates.filter((candidate) => candidateMatchesCustomerWindow(candidate, fields, "email", 2)),
    },
    {
      method: "email_amount_currency_24h",
      confidence: 75,
      reason: "Normalized email, exact amount, currency, and order time within 24 hours matched but is below auto-link threshold.",
      candidates: candidates.filter((candidate) => candidateMatchesCustomerWindow(candidate, fields, "email", 24)),
    },
    {
      method: "phone_amount_currency_2h",
      confidence: 70,
      reason: "Normalized phone, exact amount, currency, and order time within 2 hours matched but is below auto-link threshold.",
      candidates: candidates.filter((candidate) => candidateMatchesCustomerWindow(candidate, fields, "phone", 2)),
    },
  ];

  for (const tier of tiers) {
    const unique = dedupeCandidates(tier.candidates);
    if (!unique.length) continue;
    return resolveCandidateTier(unique, tier);
  }

  return {
    matched: false,
    ambiguous: false,
    matched_platform_order_id: null,
    matched_order_id: null,
    match_method: null,
    match_confidence: null,
    match_reason: fields.email || fields.phone
      ? "No conservative PayPal-to-commerce match found; email or phone alone is insufficient."
      : "No conservative PayPal-to-commerce match found.",
    match_candidate_count: 0,
  };
}

export function reconcilePaypalPaymentTransactionByCommerceReference(args: {
  payment: PaypalPaymentTransactionCommerceReferenceRow;
  candidates: PaypalCommerceOrderCandidate[];
}): PaypalReconciliationResult {
  const commerceReference = cleanText(args.payment.commerce_reference);
  if (!commerceReference) {
    return {
      matched: false,
      ambiguous: false,
      matched_platform_order_id: null,
      matched_order_id: null,
      match_method: null,
      match_confidence: null,
      match_reason: "PayPal payment transaction has no commerce_reference.",
      match_candidate_count: 0,
    };
  }

  const normalizedReference = normalizeComparableId(commerceReference);
  const candidates = dedupeCandidates(
    (args.candidates || []).filter((candidate) => normalizeComparableId(candidate.commerce_reference) === normalizedReference),
  );

  if (!candidates.length) {
    return {
      matched: false,
      ambiguous: false,
      matched_platform_order_id: null,
      matched_order_id: null,
      match_method: null,
      match_confidence: null,
      match_reason: "No WowBoost commerce order matched the PayPal commerce_reference.",
      match_candidate_count: 0,
    };
  }

  return resolveCandidateTier(candidates, {
    method: "commerce_reference_exact",
    confidence: 100,
    reason: "Exact PayPal commerce_reference matched one WowBoost commerce order.",
  });
}

export function paypalRecordMatchingFields(record: any) {
  const info = paypalTransactionInfo(record);
  const payer = paypalPayerInfo(record);
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const phone = paypalPhone(record);
  return {
    transactionId: extractPaypalTransactionId(record),
    parentTransactionIds: paypalParentTransactionIds(record),
    commerceReference: extractPaypalCommerceReference(record),
    referenceIds: extractPaypalMerchantReferenceIds(record),
    email: normalizePaypalEmail(payer.email_address ?? payer.email ?? info.email_address),
    phone: normalizePaypalPhone(phone),
    amount: amount ? Math.abs(amount.value) : null,
    currency: amount?.currency || null,
    occurredAt: cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || null,
  };
}

export function collectPaypalChunkLookupKeys(records: any[]): PaypalChunkLookupKeys {
  const transactionIds = new Set<string>();
  const parentTransactionIds = new Set<string>();
  const commerceReferences = new Set<string>();
  const referenceIds = new Set<string>();
  const merchantOrderIds = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  const currencies = new Set<string>();
  const occurredAt: string[] = [];
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (const record of records || []) {
    const fields = paypalRecordMatchingFields(record);
    if (fields.transactionId) transactionIds.add(fields.transactionId);
    for (const id of fields.parentTransactionIds) parentTransactionIds.add(id);
    if (fields.commerceReference) commerceReferences.add(fields.commerceReference);
    for (const id of fields.referenceIds) referenceIds.add(id);
    const merchantOrderId = extractReliablePaypalOrderId(record);
    if (merchantOrderId) merchantOrderIds.add(merchantOrderId);
    if (fields.email) emails.add(fields.email);
    if (fields.phone) phones.add(fields.phone);
    if (fields.currency) currencies.add(fields.currency.toUpperCase());
    if (fields.occurredAt) {
      occurredAt.push(fields.occurredAt);
      const ts = new Date(fields.occurredAt).getTime();
      if (Number.isFinite(ts)) {
        minTime = Math.min(minTime, ts);
        maxTime = Math.max(maxTime, ts);
      }
    }
  }

  return {
    transactionIds: Array.from(transactionIds),
    parentTransactionIds: Array.from(parentTransactionIds),
    commerceReferences: Array.from(commerceReferences),
    referenceIds: Array.from(referenceIds),
    merchantOrderIds: Array.from(merchantOrderIds),
    emails: Array.from(emails),
    phones: Array.from(phones),
    currencies: Array.from(currencies),
    occurredAt,
    fromIso: Number.isFinite(minTime) ? new Date(minTime - 24 * 3600000).toISOString() : null,
    toIso: Number.isFinite(maxTime) ? new Date(maxTime + 24 * 3600000).toISOString() : null,
  };
}

export function paypalBulkLookupQueryPlan(keys: PaypalChunkLookupKeys, args: { matchedOrderIds?: string[] } = {}): PaypalBulkLookupQueryPlan {
  return {
    paymentTransactionParentQueries: keys.parentTransactionIds.length ? 1 : 0,
    platformOrderReferenceQueries: (keys.commerceReferences.length ? 1 : 0) + (keys.referenceIds.length ? 2 : 0),
    platformOrderTransactionQueries: keys.transactionIds.length ? 1 : 0,
    platformOrderEmailQueries: keys.emails.length && keys.fromIso && keys.toIso ? 1 : 0,
    platformOrderPhoneQueries: 0,
    phoneMatchingDeferred: keys.phones.length,
    duplicateSaleQueries: args.matchedOrderIds?.length ? 1 : 0,
  };
}

export function chunkPaypalRecords<T>(records: T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.min(20, Math.floor(Number(chunkSize) || 15)));
  const chunks: T[][] = [];
  for (let i = 0; i < records.length; i += size) chunks.push(records.slice(i, i + size));
  return chunks;
}

export function summarizeDeferredPaypalPhoneMatching(
  records: any[],
  reconciliations: Map<string, PaypalReconciliationResult>,
  accountId?: string | null,
): PaypalPhoneMatchingSummary {
  let deferred = 0;

  for (const record of records || []) {
    const fields = paypalRecordMatchingFields(record);
    if (!fields.phone) continue;

    const recordId = stablePaypalRecordId(record, accountId);
    const match = reconciliations.get(recordId);
    if (match?.matched) continue;

    deferred += 1;
  }

  return {
    phone_matching_attempted: 0,
    phone_matching_skipped: deferred,
    phone_matching_deferred: deferred,
    phone_match_warnings: deferred ? [`phone_matching_deferred: ${deferred} records`] : [],
  };
}

export function isPaypalTransientDatabaseError(error: unknown) {
  const value = error && typeof error === "object" ? (error as Record<string, any>) : {};
  const code = String(value.code || "").trim();
  const message = String(value.message || value.details || value.hint || error || "").toLowerCase();

  if (code === "57014") return true;
  if (code === "40001" || code === "40P01" || code === "53300" || code === "53400") return true;
  if (code.startsWith("08")) return true;
  if (message.includes("statement timeout")) return true;
  if (message.includes("canceling statement due to statement timeout")) return true;
  if (message.includes("connection terminated")) return true;
  if (message.includes("connection reset")) return true;
  if (message.includes("could not connect")) return true;
  if (message.includes("temporarily unavailable")) return true;
  return false;
}

export function paypalReconciliationLookupWarning(
  kind: PaypalReconciliationLookupWarningKind,
  affectedRecords: number,
) {
  const count = Math.max(0, Math.floor(Number(affectedRecords) || 0));
  return `${kind}: ${count} records`;
}

export function paypalParentTransactionIds(record: any) {
  const info = paypalTransactionInfo(record);
  const values = [
    info.paypal_reference_id,
    info.paypalReferenceId,
    info.parent_transaction_id,
    info.parentTransactionId,
    info.reference_id,
    info.referenceId,
  ];
  return uniqueClean(values);
}

export function extractPaypalMerchantReferenceIds(record: any) {
  const info = paypalTransactionInfo(record);
  const cart = record?.cart_info ?? record?.cartInfo ?? {};
  return uniqueClean([
    info.invoice_id,
    info.invoiceId,
    info.invoice_number,
    info.invoiceNumber,
    info.custom_field,
    info.customField,
    info.paypal_reference_id,
    info.paypalReferenceId,
    info.reference_id,
    info.referenceId,
    cart.invoice_id,
    cart.invoiceId,
    cart.invoice_number,
    cart.invoiceNumber,
    cart.custom_field,
    cart.customField,
  ]);
}

export function extractPaypalCommerceReference(record: any) {
  return paypalCommerceReferenceEvidence(record).value;
}

export function paypalCommerceReferenceEvidence(record: any): PaypalCommerceReferenceEvidence {
  const candidates = paypalCommerceReferenceCandidates(record);
  const primary = candidates[0] || { source_type: "", value: "" };

  return {
    value: primary.value,
    source_type: primary.source_type,
    candidates,
  };
}

function paypalCommerceReferenceCandidates(record: any) {
  const info = paypalTransactionInfo(record);
  const cart = record?.cart_info ?? record?.cartInfo ?? {};

  return uniqueReferenceCandidates([
    { source_type: "transaction_info.custom_field", value: info.custom_field },
    { source_type: "transaction_info.custom_field", value: info.customField },
    { source_type: "cart_info.custom_field", value: cart.custom_field },
    { source_type: "cart_info.custom_field", value: cart.customField },
    { source_type: "transaction_info.invoice_id", value: info.invoice_id },
    { source_type: "transaction_info.invoice_id", value: info.invoiceId },
    { source_type: "transaction_info.invoice_number", value: info.invoice_number },
    { source_type: "transaction_info.invoice_number", value: info.invoiceNumber },
    { source_type: "transaction_info.paypal_reference_id", value: info.paypal_reference_id },
    { source_type: "transaction_info.paypal_reference_id", value: info.paypalReferenceId },
    { source_type: "transaction_info.reference_id", value: info.reference_id },
    { source_type: "transaction_info.reference_id", value: info.referenceId },
  ]);
}

export function normalizePaypalEmail(value: unknown) {
  return normalizeEmail(value);
}

export function normalizePaypalPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+")) return `+${digits}`;
  return digits;
}

export async function normalizePaypalPaymentTransactionRow(record: any, args: { accountId?: string | null; match?: PaypalReconciliationResult | null }) {
  const info = paypalTransactionInfo(record);
  const payer = paypalPayerInfo(record);
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const fee = paypalMoney(info.fee_amount ?? info.feeAmount);
  const rawTransactionId = extractPaypalTransactionId(record);
  const recordId = stablePaypalRecordId(record, args.accountId);
  const ledgerType = classifyPaypalLedgerEvent(record);
  const accountId = extractPaypalAccountId(record, args.accountId) || "unknown";
  const externalRecordId = stablePaypalPaymentEventType(record, accountId);
  const commerceReferenceEvidence = paypalCommerceReferenceEvidence(record);
  const email = cleanText(payer.email_address ?? payer.email ?? info.email_address);
  const emailFields = await emailIdentityFields(email);
  const chargebackFee = isExplicitChargeback(record) && fee ? fee.value : 0;
  const processorFee = fee && !isExplicitChargeback(record) ? fee.value : 0;
  const match = args.match || null;

  return {
    platform: "paypal",
    account_id: accountId,
    transaction_id: rawTransactionId || recordId,
    external_record_id: externalRecordId,
    parent_transaction_id: cleanText(info.paypal_reference_id ?? info.paypalReferenceId ?? info.reference_id) || null,
    order_id: extractReliablePaypalOrderId(record) || null,
    commerce_reference: commerceReferenceEvidence.value || null,
    event_type: paypalTracekitEventType(record),
    transaction_event_code: extractPaypalEventCode(record) || null,
    status: cleanText(info.transaction_status ?? info.transactionStatus ?? info.status) || null,
    email: email || null,
    email_normalized: emailFields.email_normalized,
    email_hash: emailFields.email_hash,
    amount: amount?.value ?? 0,
    fee_amount: fee?.value ?? 0,
    processor_fee: processorFee,
    gateway_fee: 0,
    chargeback_fee: chargebackFee,
    net_amount: (amount?.value ?? 0) + (fee?.value ?? 0),
    currency: amount?.currency || fee?.currency || "USD",
    payment_method: cleanText(info.instrument_type ?? info.instrumentType) || null,
    card_brand: cleanText(info.instrument_sub_type ?? info.instrumentSubType) || null,
    processor: "paypal",
    descriptor: cleanText(info.transaction_subject ?? info.transactionSubject) || null,
    transaction_ts: cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || null,
    settlement_ts: cleanText(info.transaction_updated_date ?? info.transactionUpdatedDate) || null,
    transaction_initiated_at: cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || null,
    transaction_updated_at: cleanText(info.transaction_updated_date ?? info.transactionUpdatedDate) || null,
    raw_json: {
      ...record,
      tracekit_paypal_record_id: recordId,
      tracekit_paypal_external_record_id: externalRecordId,
      tracekit_paypal_ledger_type: ledgerType,
      tracekit_paypal_transaction_event_code: extractPaypalEventCode(record) || null,
      tracekit_commerce_reference_evidence: commerceReferenceEvidence,
      tracekit_match_candidate_count: match?.match_candidate_count ?? 0,
      tracekit_match_reason: match?.match_reason ?? null,
    },
    matched_platform_order_id: match?.matched_platform_order_id ?? null,
    matched_order_id: match?.matched_order_id ?? null,
    matched_everflow_conversion_id: null,
    match_method: match?.match_method ?? null,
    match_confidence: match?.match_confidence ?? null,
    match_reason: match?.match_reason ?? null,
    match_candidate_count: match?.match_candidate_count ?? 0,
    match_status: match?.matched ? "matched" : match?.ambiguous ? "ambiguous" : "unmatched",
  };
}

export async function normalizePaypalPlatformOrderRow(record: any, args: { accountId?: string | null }) {
  const orderId = extractReliablePaypalOrderId(record);
  if (!orderId) return null;

  const info = paypalTransactionInfo(record);
  const payer = paypalPayerInfo(record);
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const accountId = extractPaypalAccountId(record, args.accountId) || "unknown";
  const email = cleanText(payer.email_address ?? payer.email ?? info.email_address);
  const emailFields = await emailIdentityFields(email);
  const ledgerType = classifyPaypalLedgerEvent(record);
  const status = normalizePaypalOrderStatus(record, ledgerType);
  const phone = paypalPhone(record);
  const commerceReferenceEvidence = paypalCommerceReferenceEvidence(record);

  return {
    platform: "paypal",
    platform_order_id: paypalPlatformOrderId(accountId, orderId),
    platform_store_id: accountId,
    order_id: orderId,
    commerce_reference: commerceReferenceEvidence.value || null,
    order_ts: cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || new Date(0).toISOString(),
    status,
    status_norm: status,
    gross_amount: amount?.value ?? 0,
    currency: amount?.currency || "USD",
    customer_email: emailFields.customer_email,
    customer_email_normalized: emailFields.customer_email_normalized,
    customer_email_hash: emailFields.customer_email_hash,
    email: emailFields.customer_email,
    phone: phone || null,
    transaction_id: extractPaypalTransactionId(record) || null,
    tkid: null,
    affiliate_id: null,
    everflow_offer_id: null,
    source_id: null,
    sub1: null,
    sub2: null,
    sub3: null,
    sub4: null,
    sub5: null,
    raw_json: {
      ...record,
      tracekit_paypal_record_id: stablePaypalRecordId(record, accountId),
      tracekit_paypal_ledger_type: ledgerType,
      tracekit_commerce_reference_evidence: commerceReferenceEvidence,
    },
  };
}

export function dedupePaypalPlatformOrderRows(rows: Array<any | null | undefined>, args: { sourceRecordCount?: number } = {}): PaypalPlatformOrderDedupeResult {
  const byId = new Map<string, any>();
  let generated = 0;

  for (const row of rows || []) {
    if (!row) continue;
    const key = cleanText(row.platform_order_id);
    if (!key) continue;

    generated += 1;
    const previous = byId.get(key);
    byId.set(key, previous ? mergePaypalPlatformOrderRows(previous, row) : canonicalizePaypalPlatformOrderRow(row));
  }

  return {
    rows: Array.from(byId.values()),
    generated,
    deduplicated: Math.max(0, generated - byId.size),
    skippedNoReference: Math.max(0, Number(args.sourceRecordCount ?? generated) - generated),
  };
}

function paypalPlatformOrderId(accountId: string, orderId: string) {
  return `paypal:${normalizeIdPart(accountId) || "unknown"}:${normalizeIdPart(orderId) || "unknown_order"}`;
}

function canonicalizePaypalPlatformOrderRow(row: any) {
  const next = { ...row };
  next.raw_json = mergedPaypalPlatformOrderRaw(null, row);
  return next;
}

function mergePaypalPlatformOrderRows(previous: any, incoming: any) {
  const merged = { ...previous };

  merged.order_id = cleanText(previous.order_id) || cleanText(incoming.order_id) || null;
  merged.commerce_reference = cleanText(previous.commerce_reference) || cleanText(incoming.commerce_reference) || null;
  merged.platform_store_id = cleanText(previous.platform_store_id) || cleanText(incoming.platform_store_id) || null;
  merged.currency = cleanText(previous.currency) || cleanText(incoming.currency) || "USD";

  for (const field of ["customer_email", "customer_email_normalized", "customer_email_hash", "email", "phone", "transaction_id"] as const) {
    if (!cleanText(merged[field]) && cleanText(incoming[field])) merged[field] = incoming[field];
  }

  merged.order_ts = earliestIso(previous.order_ts, incoming.order_ts);

  const previousStatus = cleanText(previous.status);
  const incomingStatus = cleanText(incoming.status);
  if (isMeaningfulPaypalStatus(incomingStatus)) {
    if (!isMeaningfulPaypalStatus(previousStatus) || String(incoming.order_ts || "") >= String(previous.order_ts || "")) {
      merged.status = incoming.status;
      merged.status_norm = incoming.status_norm || incoming.status;
    }
  }

  merged.gross_amount = canonicalPaypalGrossAmount(previous, incoming);
  merged.raw_json = mergedPaypalPlatformOrderRaw(previous, incoming);

  return merged;
}

function canonicalPaypalGrossAmount(previous: any, incoming: any) {
  const previousType = cleanText(previous?.raw_json?.tracekit_paypal_ledger_type);
  const incomingType = cleanText(incoming?.raw_json?.tracekit_paypal_ledger_type);
  const previousAmount = Number(previous?.gross_amount ?? 0);
  const incomingAmount = Number(incoming?.gross_amount ?? 0);

  if (previousType === "sale" && previousAmount > 0) return previousAmount;
  if (incomingType === "sale" && incomingAmount > 0) return incomingAmount;
  if (previousAmount > 0) return previousAmount;
  if (incomingAmount > 0) return incomingAmount;
  return previousAmount || incomingAmount || 0;
}

function mergedPaypalPlatformOrderRaw(previous: any | null, incoming: any) {
  const previousRaw = previous?.raw_json || {};
  const incomingRaw = incoming?.raw_json || {};
  const records = [
    ...paypalRawRecords(previousRaw),
    ...paypalRawRecords(incomingRaw),
  ];
  const transactionIds = uniqueClean([
    ...paypalRawTransactionIds(previousRaw),
    ...paypalRawTransactionIds(incomingRaw),
    previous?.transaction_id,
    incoming?.transaction_id,
  ]);

  return {
    ...previousRaw,
    ...incomingRaw,
    tracekit_paypal_transaction_ids: transactionIds,
    tracekit_paypal_records: records,
  };
}

function paypalRawRecords(raw: any) {
  if (!raw) return [];
  if (Array.isArray(raw.tracekit_paypal_records)) return raw.tracekit_paypal_records;
  return [raw];
}

function paypalRawTransactionIds(raw: any) {
  if (!raw) return [];
  const fromArray = Array.isArray(raw.tracekit_paypal_transaction_ids) ? raw.tracekit_paypal_transaction_ids : [];
  return uniqueClean([
    ...fromArray,
    raw?.transaction_info?.transaction_id,
    raw?.transactionInfo?.transactionId,
    raw?.transaction_id,
    raw?.transactionId,
  ]);
}

function earliestIso(a: unknown, b: unknown) {
  const left = cleanText(a);
  const right = cleanText(b);
  if (!left) return right || new Date(0).toISOString();
  if (!right) return left;
  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function isMeaningfulPaypalStatus(status: string) {
  return Boolean(status && status !== "UNKNOWN");
}

export function buildPaypalLedgerEventsFromRecord(record: any, args: {
  accountId?: string | null;
  connectorId?: string | null;
  orderId?: string | null;
} = {}): PaypalLedgerEvent[] {
  const info = paypalTransactionInfo(record);
  const accountId = extractPaypalAccountId(record, args.accountId) || "unknown";
  const connectorId = cleanText(args.connectorId) || stablePaypalConnectorId({ merchantAccountId: accountId });
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const fee = paypalMoney(info.fee_amount ?? info.feeAmount);
  const ledgerType = classifyPaypalLedgerEvent(record);
  const orderId = args.orderId !== undefined ? cleanText(args.orderId) || null : extractReliablePaypalOrderId(record) || null;
  const rawTransactionId = extractPaypalTransactionId(record);
  const eventCode = extractPaypalEventCode(record);
  const status = cleanText(info.transaction_status ?? info.transactionStatus ?? info.status) || String(ledgerType || "unknown");
  const events: PaypalLedgerEvent[] = [];

  if (ledgerType && amount && amount.value !== 0) {
    events.push({
      ledgerType,
      transactionId: stablePaypalLedgerEventId({
        accountId,
        transactionId: rawTransactionId || stablePaypalRecordId(record, accountId),
        eventCode,
        ledgerType,
        recordIdentity: stablePaypalRecordId(record, accountId),
      }),
      parentTransactionId: cleanText(info.paypal_reference_id ?? info.paypalReferenceId ?? info.reference_id) || null,
      amount: amount.value,
      currency: amount.currency,
      status,
      reason: paypalLedgerReason(record, ledgerType),
      occurredAt: paypalFinancialEventTimestamp(record, ledgerType),
      orderId,
      connectorId,
      accountId,
      raw: record,
    });
  }

  if (fee && fee.value !== 0) {
    const feeLedgerType: PaypalLedgerType = isExplicitChargeback(record) ? "chargeback_fee" : "processor_fee";
    events.push({
      ledgerType: feeLedgerType,
      transactionId: stablePaypalLedgerEventId({
        accountId,
        transactionId: rawTransactionId || stablePaypalRecordId(record, accountId),
        eventCode,
        ledgerType: feeLedgerType,
        recordIdentity: stablePaypalRecordId(record, accountId),
      }),
      parentTransactionId: rawTransactionId || null,
      amount: fee.value,
      currency: fee.currency,
      status: feeLedgerType,
      reason: feeLedgerType === "chargeback_fee" ? "PayPal explicit chargeback/dispute fee" : "PayPal explicit processor fee",
      occurredAt: paypalFinancialEventTimestamp(record, feeLedgerType),
      orderId,
      connectorId,
      accountId,
      raw: record,
    });
  }

  return events;
}

export function filterPaypalDuplicateCommerceSaleEvents(events: PaypalLedgerEvent[], existingCommerceSaleOrderIds: Set<string>) {
  return events.filter((event) => {
    if (event.ledgerType !== "sale") return true;
    if (!event.orderId) return true;
    return !existingCommerceSaleOrderIds.has(event.orderId);
  });
}

export function buildPaypalLedgerEventsFromDispute(dispute: any, args: {
  accountId: string;
  connectorId: string;
}): PaypalLedgerEvent[] {
  const disputeId = cleanText(dispute?.dispute_id ?? dispute?.id);
  if (!disputeId) return [];

  const amount = paypalMoney(dispute?.dispute_amount ?? dispute?.disputed_amount ?? dispute?.amount);
  const fee = paypalMoney(dispute?.chargeback_fee ?? dispute?.dispute_fee);
  const text = lowerJoin(dispute?.status, dispute?.reason, dispute?.outcome, dispute?.dispute_life_cycle_stage);
  const occurredAt = cleanText(dispute?.update_time ?? dispute?.create_time) || new Date(0).toISOString();
  const orderId = cleanText(dispute?.invoice_id ?? dispute?.custom_field) || null;
  const events: PaypalLedgerEvent[] = [];

  if (amount && amount.value !== 0) {
    const ledgerType: PaypalLedgerType =
      text.includes("seller") && (text.includes("favor") || text.includes("favour") || text.includes("won"))
        ? "reversal"
        : "chargeback";

    events.push({
      ledgerType,
      transactionId: `paypal:${normalizeIdPart(args.accountId)}:${disputeId}:${ledgerType}`,
      parentTransactionId: cleanText(dispute?.disputed_transaction_id) || null,
      amount: amount.value,
      currency: amount.currency,
      status: cleanText(dispute?.status) || ledgerType,
      reason: ledgerType === "chargeback" ? "PayPal explicit dispute/chargeback" : "PayPal explicit dispute recovery",
      occurredAt,
      orderId,
      connectorId: args.connectorId,
      accountId: args.accountId,
      raw: dispute,
    });
  }

  if (fee && fee.value !== 0) {
    events.push({
      ledgerType: "chargeback_fee",
      transactionId: `paypal:${normalizeIdPart(args.accountId)}:${disputeId}:chargeback_fee`,
      parentTransactionId: disputeId,
      amount: fee.value,
      currency: fee.currency,
      status: "chargeback_fee",
      reason: "PayPal explicit dispute/chargeback fee",
      occurredAt,
      orderId,
      connectorId: args.connectorId,
      accountId: args.accountId,
      raw: dispute,
    });
  }

  return events;
}

export function classifyPaypalLedgerEvent(record: any): PaypalLedgerType | null {
  const eventCode = extractPaypalEventCode(record);
  const text = paypalExplicitText(record);
  const amount = paypalMoney(paypalTransactionInfo(record).transaction_amount ?? paypalTransactionInfo(record).transactionAmount);

  if (text.includes("chargeback fee") || text.includes("dispute fee")) return "chargeback_fee";
  if (text.includes("chargeback") || text.includes("dispute lost") || text.includes("dispute_loss")) return "chargeback";
  if (text.includes("refund")) return "refund";
  if (text.includes("reversal") || text.includes("reversed") || text.includes("recovery") || text.includes("recovered")) return "reversal";
  if (text.includes("adjustment")) return "adjustment";

  if (PAYPAL_REFUND_EVENT_CODES.has(eventCode)) return "refund";
  if (PAYPAL_REVERSAL_EVENT_CODES.has(eventCode)) return "reversal";
  if (PAYPAL_ADJUSTMENT_EVENT_CODES.has(eventCode)) return "adjustment";
  if (PAYPAL_SALE_EVENT_CODES.has(eventCode) && Number(amount?.value ?? 0) > 0) return "sale";

  return null;
}

export function stablePaypalRecordId(record: any, fallbackAccountId?: unknown) {
  const info = paypalTransactionInfo(record);
  const accountId = extractPaypalAccountId(record, fallbackAccountId) || "unknown";
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const fee = paypalMoney(info.fee_amount ?? info.feeAmount);
  return [
    "paypal",
    accountId,
    extractPaypalTransactionId(record) || "no_transaction",
    extractPaypalEventCode(record) || "no_event_code",
    cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || "no_initiation_date",
    amount?.currency || "no_currency",
    amount?.value ?? "no_amount",
    fee?.value ?? "no_fee",
    cleanText(info.paypal_reference_id ?? info.paypalReferenceId ?? info.reference_id) || "no_reference",
  ].map((part) => normalizeIdPart(part) || "none").join(":");
}

export function stablePaypalLedgerEventId(args: {
  accountId: string;
  transactionId: string;
  eventCode?: string | null;
  ledgerType: PaypalLedgerType;
  recordIdentity: string;
}) {
  return [
    "paypal",
    normalizeIdPart(args.accountId) || "unknown",
    normalizeIdPart(args.transactionId) || "no_transaction",
    normalizeIdPart(args.eventCode) || "no_event_code",
    args.ledgerType,
    normalizeIdPart(args.recordIdentity) || "no_record",
  ].join(":");
}

export function extractPaypalTransactionId(record: any) {
  const info = paypalTransactionInfo(record);
  return cleanText(info.transaction_id ?? info.transactionId);
}

export function extractPaypalAccountId(record: any, fallback?: unknown) {
  const info = paypalTransactionInfo(record);
  const payer = paypalPayerInfo(record);
  return cleanText(
    info.paypal_account_id ??
      info.paypalAccountId ??
      info.account_id ??
      record?.paypal_account_id ??
      record?.account_id ??
      fallback ??
      payer.merchant_id ??
      payer.account_id,
  );
}

export function extractReliablePaypalOrderId(record: any) {
  const info = paypalTransactionInfo(record);
  const cart = record?.cart_info ?? record?.cartInfo ?? {};
  return cleanText(
    info.invoice_id ??
      info.invoiceId ??
      info.invoice_number ??
      info.invoiceNumber ??
      info.custom_field ??
      info.customField ??
      cart.invoice_id ??
      cart.invoiceId ??
      cart.invoice_number ??
      cart.invoiceNumber ??
      cart.custom_field ??
      cart.customField,
  );
}

function resolveLinkedPaypalMatch(parentTransactionIds: string[], linked: PaypalMatchedTransaction[]): PaypalReconciliationResult | null {
  if (!parentTransactionIds.length || !linked.length) return null;
  const parents = new Set(parentTransactionIds.map(normalizeComparableId).filter(Boolean));
  const matches = linked.filter((row) => {
    const tx = normalizeComparableId(row.transaction_id);
    const parent = normalizeComparableId(row.parent_transaction_id);
    return Boolean(
      row.matched_platform_order_id &&
        row.matched_order_id &&
        ((tx && parents.has(tx)) || (parent && parents.has(parent))),
    );
  });

  const unique = new Map<string, PaypalMatchedTransaction>();
  for (const match of matches) {
    const key = cleanText(match.matched_platform_order_id);
    if (key) unique.set(key, match);
  }

  if (unique.size === 1) {
    const match = Array.from(unique.values())[0];
    return {
      matched: true,
      ambiguous: false,
      matched_platform_order_id: cleanText(match.matched_platform_order_id) || null,
      matched_order_id: cleanText(match.matched_order_id) || null,
      match_method: "parent_paypal_transaction",
      match_confidence: 95,
      match_reason: "Linked through an already matched parent PayPal transaction.",
      match_candidate_count: 1,
    };
  }

  if (unique.size > 1) {
    return {
      matched: false,
      ambiguous: true,
      matched_platform_order_id: null,
      matched_order_id: null,
      match_method: "parent_paypal_transaction",
      match_confidence: 95,
      match_reason: `Ambiguous parent PayPal transaction match: ${unique.size} candidates.`,
      match_candidate_count: unique.size,
    };
  }

  return null;
}

function resolveCandidateTier(
  candidates: PaypalCommerceOrderCandidate[],
  tier: { method: string; confidence: number; reason: string },
): PaypalReconciliationResult {
  if (candidates.length === 1) {
    const candidate = candidates[0];
    const platformOrderId = cleanText(candidate.platform_order_id);
    const orderId = cleanText(candidate.order_id);
    const autoLink = tier.confidence >= 80 && Boolean(platformOrderId && orderId);
    return {
      matched: autoLink,
      ambiguous: false,
      matched_platform_order_id: autoLink ? platformOrderId : null,
      matched_order_id: autoLink ? orderId : null,
      match_method: tier.method,
      match_confidence: tier.confidence,
      match_reason: autoLink ? tier.reason : `${tier.reason} Auto-link skipped because confidence is below 80.`,
      match_candidate_count: 1,
    };
  }

  return {
    matched: false,
    ambiguous: true,
    matched_platform_order_id: null,
    matched_order_id: null,
    match_method: tier.method,
    match_confidence: tier.confidence,
    match_reason: `Ambiguous PayPal match by ${tier.method}: ${candidates.length} candidates.`,
    match_candidate_count: candidates.length,
  };
}

function dedupeCandidates(candidates: PaypalCommerceOrderCandidate[]) {
  const map = new Map<string, PaypalCommerceOrderCandidate>();
  for (const candidate of candidates || []) {
    const key = cleanText(candidate.platform_order_id) || cleanText(candidate.order_id) || JSON.stringify(candidate);
    if (key) map.set(key, candidate);
  }
  return Array.from(map.values());
}

function candidateMatchesReference(candidate: PaypalCommerceOrderCandidate, refs: string[]) {
  if (!refs.length) return false;
  const normalizedRefs = new Set(refs.map(normalizeComparableId).filter(Boolean));
  return [candidate.order_id, candidate.platform_order_id]
    .map(normalizeComparableId)
    .some((value) => Boolean(value && normalizedRefs.has(value)));
}

function candidateMatchesCommerceReference(candidate: PaypalCommerceOrderCandidate, reference: string) {
  const normalizedReference = normalizeComparableId(reference);
  if (!normalizedReference) return false;
  return normalizeComparableId(candidate.commerce_reference) === normalizedReference;
}

function candidateMatchesCustomerWindow(
  candidate: PaypalCommerceOrderCandidate,
  fields: ReturnType<typeof paypalRecordMatchingFields>,
  identity: "email" | "phone",
  hours: number,
) {
  if (!fields.amount || !fields.currency || !fields.occurredAt) return false;
  if (!candidateAmountMatches(candidate, fields.amount, fields.currency)) return false;
  if (!candidateTimeWithin(candidate, fields.occurredAt, hours)) return false;

  if (identity === "email") {
    if (!fields.email) return false;
    const candidateEmail = normalizePaypalEmail(candidate.customer_email_normalized || candidate.customer_email || candidate.email);
    return candidateEmail === fields.email;
  }

  if (!fields.phone) return false;
  const candidatePhone = normalizePaypalPhone(candidate.phone);
  return Boolean(candidatePhone && candidatePhone === fields.phone);
}

function candidateAmountMatches(candidate: PaypalCommerceOrderCandidate, amount: number, currency: string) {
  const candidateAmount = Number(String(candidate.gross_amount ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(candidateAmount)) return false;
  const candidateCurrency = cleanText(candidate.currency).toUpperCase() || "USD";
  return candidateCurrency === currency.toUpperCase() && Math.round(Math.abs(candidateAmount) * 100) === Math.round(Math.abs(amount) * 100);
}

function candidateTimeWithin(candidate: PaypalCommerceOrderCandidate, occurredAt: string, hours: number) {
  const orderTime = new Date(String(candidate.order_ts ?? "")).getTime();
  const eventTime = new Date(occurredAt).getTime();
  if (!Number.isFinite(orderTime) || !Number.isFinite(eventTime)) return false;
  return Math.abs(orderTime - eventTime) <= hours * 3600000;
}

function idsEqual(a: unknown, b: unknown) {
  const left = normalizeComparableId(a);
  const right = normalizeComparableId(b);
  return Boolean(left && right && left === right);
}

function normalizeComparableId(value: unknown) {
  return cleanText(value).toLowerCase();
}

function uniqueClean(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = normalizeComparableId(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function uniqueReferenceCandidates(values: Array<{ source_type: string; value: unknown }>) {
  const seen = new Set<string>();
  const out: PaypalCommerceReferenceEvidence["candidates"] = [];
  for (const candidate of values) {
    const text = cleanText(candidate.value);
    if (!text) continue;
    const key = normalizeComparableId(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source_type: candidate.source_type,
      value: text,
    });
  }
  return out;
}

function stablePaypalPaymentEventType(record: any, accountId: string) {
  const info = paypalTransactionInfo(record);
  const amount = paypalMoney(info.transaction_amount ?? info.transactionAmount);
  const fee = paypalMoney(info.fee_amount ?? info.feeAmount);
  return [
    extractPaypalEventCode(record) || classifyPaypalLedgerEvent(record) || "paypal_record",
    cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate) || "no_date",
    amount?.currency || "no_currency",
    amount?.value ?? "no_amount",
    fee?.value ?? "no_fee",
    normalizeIdPart(accountId),
  ].map((part) => normalizeIdPart(part) || "none").join(":");
}

function paypalTransactionInfo(record: any) {
  return record?.transaction_info ?? record?.transactionInfo ?? record ?? {};
}

function paypalPayerInfo(record: any) {
  return record?.payer_info ?? record?.payerInfo ?? {};
}

export function extractPaypalEventCode(record: any) {
  const info = paypalTransactionInfo(record);
  return cleanText(info.transaction_event_code ?? info.transactionEventCode).toUpperCase();
}

export function paypalFinancialEventTimestamp(record: any, ledgerType: PaypalLedgerType | null = classifyPaypalLedgerEvent(record)) {
  const info = paypalTransactionInfo(record);
  const initiated = cleanText(info.transaction_initiation_date ?? info.transactionInitiationDate);
  const updated = cleanText(info.transaction_updated_date ?? info.transactionUpdatedDate);

  // PayPal captures are chronologically anchored to initiation; later lifecycle
  // events such as refunds, reversals, disputes, and standalone fees prefer the
  // update timestamp because it is the lifecycle event timestamp PayPal exposes.
  if (ledgerType === "sale") return initiated || updated || new Date(0).toISOString();
  if (ledgerType === "processor_fee" && classifyPaypalLedgerEvent(record) === "sale") {
    return initiated || updated || new Date(0).toISOString();
  }
  return updated || initiated || new Date(0).toISOString();
}

function paypalTracekitEventType(record: any) {
  const ledgerType = classifyPaypalLedgerEvent(record);
  if (ledgerType) return ledgerType;
  const fee = paypalMoney(paypalTransactionInfo(record).fee_amount ?? paypalTransactionInfo(record).feeAmount);
  if (fee && fee.value !== 0) return isExplicitChargeback(record) ? "chargeback_fee" : "processor_fee";
  return "paypal_record";
}

function paypalExplicitText(record: any) {
  const info = paypalTransactionInfo(record);
  return lowerJoin(
    info.transaction_event_code,
    info.transaction_status,
    info.transaction_status_description,
    info.transaction_subject,
    info.transaction_note,
    info.paypal_reference_id_type,
    info.transaction_type,
    record?.event_type,
    record?.status,
  );
}

function isExplicitChargeback(record: any) {
  const text = paypalExplicitText(record);
  return text.includes("chargeback") || text.includes("dispute");
}

function normalizePaypalOrderStatus(record: any, ledgerType: PaypalLedgerType | null) {
  if (ledgerType === "sale") return "COMPLETED";
  if (ledgerType === "refund") return "REFUNDED";
  if (ledgerType === "chargeback") return "CHARGEBACK";
  if (ledgerType === "reversal") return "REVERSED";
  if (ledgerType === "adjustment") return "ADJUSTMENT";

  const text = paypalExplicitText(record).toUpperCase();
  if (text.includes("PENDING")) return "PENDING";
  if (text.includes("DENIED") || text.includes("FAILED")) return "DECLINED";
  if (text.includes("COMPLETED") || text.includes("SUCCESS")) return "COMPLETED";
  return "UNKNOWN";
}

function paypalLedgerReason(record: any, ledgerType: PaypalLedgerType) {
  const info = paypalTransactionInfo(record);
  const subject = cleanText(info.transaction_subject ?? info.transactionSubject);
  if (subject) return `PayPal ${ledgerType}: ${subject}`;
  return `PayPal ${ledgerType}`;
}

function paypalPhone(record: any) {
  const payer = paypalPayerInfo(record);
  const phone = payer.phone_number ?? payer.phoneNumber ?? {};
  return cleanText(phone.national_number ?? phone.nationalNumber ?? phone.phone_number ?? payer.phone);
}

function paypalMoney(value: any): PaypalMoney | null {
  if (value === undefined || value === null) return null;
  const rawValue = typeof value === "object" ? value.value ?? value.amount : value;
  const n = Number(String(rawValue ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const currency = String(
    typeof value === "object"
      ? value.currency_code ?? value.currencyCode ?? value.currency ?? "USD"
      : "USD",
  ).toUpperCase();
  return { value: n, currency };
}

async function paypalJsonRequest(args: {
  url: string;
  accessToken: string;
  capability: PaypalApiError["capability"];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetcher = args.fetchImpl ?? fetch;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetchWithTimeout(
      fetcher,
      args.url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${args.accessToken}`,
        },
      },
      args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const text = await readTextSafe(res);
    const parsed = safeJsonParse(text);

    if (res.ok) return parsed ?? {};

    const retryable = res.status === 429 || res.status >= 500;
    lastError = paypalErrorFromResponse(res.status, text, parsed, args.capability);
    if (!retryable || attempt >= 3) break;
    await sleep(250 * attempt);
  }

  throw lastError;
}

export function classifyPaypalError(status: number, text: string, parsed: any, capability?: PaypalApiError["capability"]) {
  const raw = lowerJoin(parsed?.error, parsed?.error_description, parsed?.message, parsed?.name, text);

  if (status === 401 || raw.includes("invalid_client")) {
    return {
      code: "invalid_paypal_credentials",
      message: "PayPal rejected the client ID, client secret, or environment.",
      capability,
    };
  }

  if (status === 403 || raw.includes("not_authorized") || raw.includes("permission") || raw.includes("scope")) {
    return {
      code: capability === "disputes" ? "missing_dispute_permissions" : "missing_reporting_permissions",
      message:
        capability === "disputes"
          ? "PayPal disputes API access is unavailable for these credentials/scopes."
          : "PayPal reporting permissions are missing for these credentials/scopes.",
      capability,
    };
  }

  if (status === 429) {
    return {
      code: "paypal_rate_limited",
      message: "PayPal rate limited the request. Try again later.",
      capability,
    };
  }

  if (status === 408 || raw.includes("timeout")) {
    return {
      code: "paypal_timeout",
      message: "PayPal request timed out.",
      capability,
    };
  }

  if (status >= 500) {
    return {
      code: "paypal_upstream_error",
      message: `PayPal upstream error (${status}).`,
      capability,
    };
  }

  return {
    code: "paypal_request_failed",
    message: `PayPal request failed (${status}): ${String(text || parsed?.message || "").slice(0, 300)}`,
    capability,
  };
}

function paypalErrorFromResponse(status: number, text: string, parsed: any, capability?: PaypalApiError["capability"]) {
  const classified = classifyPaypalError(status, text, parsed, capability);
  return new PaypalApiError({
    code: classified.code,
    message: classified.message,
    status,
    capability: classified.capability,
  });
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (String(error?.name || "").toLowerCase() === "aborterror" || message.toLowerCase().includes("timeout")) {
      throw new PaypalApiError({
        code: "paypal_timeout",
        message: "PayPal request timed out.",
        status: 408,
        capability: "upstream",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseYmd(value: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0));
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDaysUTC(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function isoYmdUTC(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function lowerJoin(...values: unknown[]) {
  return values.map((value) => String(value ?? "")).filter(Boolean).join(" ").toLowerCase();
}

function normalizeIdPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fnv1aHash(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : "";
}

async function sha256Hex(value: string) {
  if (!value) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function emailIdentityFields(emailRaw: unknown) {
  const email = cleanText(emailRaw);
  const emailNorm = normalizeEmail(email);
  const emailHash = emailNorm ? await sha256Hex(emailNorm) : "";
  return {
    email_normalized: emailNorm || null,
    email_hash: emailHash || null,
    customer_email: email || null,
    customer_email_normalized: emailNorm || null,
    customer_email_hash: emailHash || null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
