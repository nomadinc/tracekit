// src/index.ts
// TraceKit API Worker (Cloudflare Workers + Supabase)
// Integrations: CheckoutChamp/Konnektive + WOWSuite (WowBoost + WowPay umbrella)

import { createClient } from "@supabase/supabase-js";
type LedgerType =
  | "sale"
  | "refund"
  | "chargeback"
  | "chargeback_fee"
  | "processor_fee"
  | "bank_fee"
  | "shipping_cost"
  | "tax"
  | "cogs"
  | "affiliate_payout"
  | "ad_spend"
  | "reversal"
  | "adjustment";

const NEGATIVE_LEDGER_TYPES: LedgerType[] = [
  "refund",
  "chargeback",
  "chargeback_fee",
  "processor_fee",
  "bank_fee",
  "shipping_cost",
  "cogs",
  "affiliate_payout",
  "ad_spend",
  "reversal",
];

function normalizeLedgerAmount(ledgerType: LedgerType, amountCents: number) {
  return NEGATIVE_LEDGER_TYPES.includes(ledgerType)
    ? -Math.abs(amountCents)
    : Math.abs(amountCents);
}

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DEFAULT_WOWSUITE_AUTH_BASE?: string;
  DEFAULT_WOWSUITE_EXPORT_BASE?: string;
  INTEGRATIONS_ENC_KEY: string;
  TK_SECRET_KEY?: string;
  DEFAULT_CC_BASE?: string;
};

type RunImportArgs = {
  from: string;
  to: string;
  filter?: string | null;
  pageSize?: number;
  debug?: boolean;
};

const DEFAULT_CC_BASE = "https://api.checkoutchamp.com";
const DEFAULT_WOWSUITE_AUTH_BASE = "https://public-api.tryemanagecrm.com";
const DEFAULT_WOWSUITE_EXPORT_BASE = "https://ecrm-public-api-prod.azurewebsites.net";

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, X-TK-Secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      ...extraHeaders,
    },
  });
}

function toCents(value: unknown): number {
  const n = Number(value ?? 0);
  return Math.round(n * 100);
}

function detectLedgerType(payload: any): LedgerType {
  const raw = String(
    payload.ledger_type ||
      payload.type ||
      payload.event ||
      payload.status ||
      ""
  ).toLowerCase();

  if (raw.includes("chargeback_fee")) return "chargeback_fee";
  if (raw.includes("processor_fee")) return "processor_fee";
  if (raw.includes("bank_fee")) return "bank_fee";
  if (raw.includes("chargeback") || raw.includes("dispute")) return "chargeback";
  if (raw.includes("refund")) return "refund";
  if (raw.includes("reversal")) return "reversal";
  if (raw.includes("adjustment")) return "adjustment";

  return "sale";
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, X-TK-Secret",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (String(e?.name || "").toLowerCase() === "aborterror" || String(e?.message || "").toLowerCase().includes("timeout")) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}


async function readJsonBody(req: Request) {
  return (await req.json().catch(() => ({}))) as any;
}

function parseYmd(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

function isoYmdUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtCcMdYy(d: Date) {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(-2)}`;
}

function normStatusUpper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function parseMoneyMaybe(v: any) {
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getSupabase(env: Env) {
  const url = String(env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function u8ToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

async function importAesKey(env: Env) {
  const b64 = String(env.INTEGRATIONS_ENC_KEY ?? "").trim();
  if (!b64) throw new Error("Missing INTEGRATIONS_ENC_KEY");
  const raw = b64ToU8(b64);
  if (raw.byteLength !== 32) throw new Error("INTEGRATIONS_ENC_KEY must be base64 of 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(env: Env, plaintext: string) {
  const key = await importAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { v: 1, alg: "AES-GCM", iv_b64: u8ToB64(iv), ct_b64: u8ToB64(new Uint8Array(ct)) };
}

async function decryptSecret(env: Env, iv_b64: string, ct_b64: string) {
  const key = await importAesKey(env);
  const iv = b64ToU8(String(iv_b64 ?? "").trim());
  const ct = b64ToU8(String(ct_b64 ?? "").trim());
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function decryptSecretFromCredRow(env: Env, cred: any) {
  return decryptSecret(env, String(cred.password_iv ?? ""), String(cred.password_ciphertext ?? ""));
}

type WowSuiteSub = "wowboost" | "wowpay";
function wowSuiteKey(sub: WowSuiteSub) {
  return `wowsuite:${sub}`;
}

function coercePlatformKey(raw: any) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "wowboost") return wowSuiteKey("wowboost");
  if (s === "wowpay") return wowSuiteKey("wowpay");
  if (s === "wowsuite:wowboost") return wowSuiteKey("wowboost");
  if (s === "wowsuite:wowpay") return wowSuiteKey("wowpay");
  if (s === "konnektive" || s === "konnective") return "checkoutchamp";
  if (s === "checkoutchamp") return "checkoutchamp";
  if (s === "wowsuite") return "wowsuite";
  if (s === "nmi") return "nmi";
  return s;
}

function b64BasicFromUserPass(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function wowSuiteParseToken(text: string) {
  const t = String(text ?? "").trim();
  if (t.length > 40 && t.includes(".") && !t.startsWith("{") && !t.startsWith("[")) return t;
  const js = safeJsonParse(t);
  const token =
    js?.token ||
    js?.access_token ||
    js?.accessToken ||
    js?.data?.token ||
    js?.data?.access_token ||
    js?.data?.accessToken ||
    null;
  return token ? String(token) : null;
}

async function wowSuiteGetBearerToken(args: { authBase: string; username: string; password: string }) {
  const res = await fetch(`${args.authBase.replace(/\/+$/, "")}/auth`, {
    method: "POST",
    headers: {
      Authorization: b64BasicFromUserPass(args.username, args.password),
      Accept: "application/json, text/plain, */*",
    },
  });

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WOWSuite auth failed (${res.status}): ${text || res.statusText}`);

  const token = wowSuiteParseToken(text);
  if (!token) throw new Error(`WOWSuite auth: token not found in response: ${text.slice(0, 200)}`);

  return token;
}

async function runWowPayImportPage(env: Env, args: { from: string; to: string; page: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "wowpay");
  if (!creds) throw new Error("WowPay not connected.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);
  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

  const url = new URL(`${authBase}/order/${args.page}/${pageSize}`);
  url.searchParams.set("StartDate", `${args.from} 00:00:00`);
  url.searchParams.set("EndDate", `${args.to} 23:59:59`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },
  });

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WowPay order query failed ${res.status}: ${text.slice(0, 300)}`);

  const js = safeJsonParse(text);
  if (!js) throw new Error(`WowPay returned invalid JSON: ${text.slice(0, 300)}`);

  const orders = Array.isArray(js.customerOrders) ? js.customerOrders : Array.isArray(js.orders) ? js.orders : [];

  const upserts = await Promise.all(
    orders.map(async (o: any) => {
      const orderId = String(o.orderId ?? o.orderNumber ?? "").trim();
      if (!orderId) return null;

      const receipts = Array.isArray(o.receipts) ? o.receipts : [];
      const receipt = receipts[0] || {};
      const status = wowSuiteNormalizeStatus(receipt.paymentStatus || o.orderStatus);

      let gross =
		  parseMoneyMaybe(
		    receipt.amountUSD ??
		      receipt.amount ??
		      o.amountUSD ??
		      o.amount ??
		      o.totalAmount ??
		      o.orderTotal ??
		      o.total ??
		      o.price ??
		      o.productPrice ??
		      o.formattedProductPrice,
		  ) ?? 0;
      if (gross == null) gross = 0;
      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
        gross = -Math.abs(gross);
      }

      const emailFields = await emailIdentityFields(
        o.email || o.customerEmail || o.customer?.email || receipt.email
      );

      const transactionId = receipt.transactionId || receipt.transactionID || o.transactionId || o.paymentTrackingNumber || null;
      const phone = normalizePhone(o.phoneNumber || o.customerPhone || o.phone || o.customer?.phoneNumber || "");
	  
	  console.log(
		  "WOWPAY AMOUNTS",
		  {
		    amountUSD: o.amountUSD,
		    amount: o.amount,
		    totalAmount: o.totalAmount,
		    orderTotal: o.orderTotal,
		    total: o.total,
		    price: o.price,
		    productPrice: o.productPrice,
		  }
		);
	  
      return {
		  platform: "wowpay",
		  platform_order_id: `wowpay:${orderId}`,
		  platform_store_id: o.campaignId || o.campaignID || o.campaign_id || null,
		  order_id: String(orderId),
		  order_ts: parseDateToIsoMaybe(
		    receipt.createDate || o.orderDate || o.lastUpdateDate
		  ) || `${args.from}T00:00:00.000Z`,
		  status,
		  status_norm: status,
		
		  gross_amount: gross,
		
		  receipt_total:
		    parseMoneyMaybe(
		      receipt.amountUSD ??
		      receipt.amount ??
		      o.amountUSD ??
		      o.amount ??
		      o.totalAmount ??
		      o.orderTotal ??
		      o.total ??
		      o.price ??
		      o.productPrice ??
		      o.formattedProductPrice
		    ) ?? null,
		
		  currency: receipt.currencyCode || o.currencyCode || "USD",

        ...emailFields,
        email: emailFields.customer_email,
        phone: phone || null,

        transaction_id: transactionId,
        everflow_transaction_id: o._ef_transaction_id || o.ef_transaction_id || o.everflow_transaction_id || transactionId || null,
        tkid: o.tkid || o.tk_id || o.tracekit_id || null,
        affiliate_id: o.affiliateId || o.affiliateID || o.affiliate_id || null,
        everflow_offer_id: o.offerId || o.offerID || o.offer_id || o.campaignId || o.campaignID || null,
        source_id: o.sourceId || o.sourceID || o.source_id || null,
        sub1: o.s1 || o.S1 || o.sub1 || null,
        sub2: o.s2 || o.S2 || o.sub2 || null,
        sub3: o.s3 || o.S3 || o.sub3 || null,
        sub4: o.s4 || o.S4 || o.sub4 || null,
        sub5: o.s5 || o.S5 || o.sub5 || null,

        product_subtotal: parseMoneyMaybe(o.productSubtotal ?? o.subtotal ?? o.productPrice) ?? null,
        shipping_amount: parseMoneyMaybe(o.shippingAmount ?? o.shipping ?? o.shipAmount) ?? null,
        tax_amount: parseMoneyMaybe(o.taxAmount ?? o.tax) ?? null,
        product_cost: parseMoneyMaybe(o.productCost ?? o.product_cost) ?? null,
        shipping_cost: parseMoneyMaybe(o.shippingCost ?? o.shipping_cost) ?? null,
        gateway_fee: parseMoneyMaybe(receipt.gatewayFee ?? receipt.processorFee ?? o.gatewayFee) ?? null,
        chargeback_fee: parseMoneyMaybe(o.chargebackFee ?? o.chargeback_fee) ?? null,
        tracking_number: receipt.trackingNumber || o.trackingNumber || o.shipmentTrackingNumber || null,
        shipping_carrier: o.shippingCarrier || o.carrier || null,
        raw_json: o,
      };
    })
  );

  const deduped = dedupePlatformOrders(upserts.filter(Boolean));

  if (deduped.length) {
    const { error } = await supabase.from("platform_orders").upsert(deduped as any[], { onConflict: "platform_order_id" });
    if (error) throw new Error(error.message);
  }

  return {
    fetched: orders.length,
    upserted: deduped.length,
    page: args.page,
    pageSize,
    hasMore: Boolean(js?.paging?.nextPage) || orders.length >= pageSize,
    nextPage: (Boolean(js?.paging?.nextPage) || orders.length >= pageSize) ? args.page + 1 : null,
  };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const outRows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      cur = "";
      if (row.length && row[row.length - 1].endsWith("\r")) row[row.length - 1] = row[row.length - 1].slice(0, -1);
      outRows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    if (row.length && row[row.length - 1].endsWith("\r")) row[row.length - 1] = row[row.length - 1].slice(0, -1);
    outRows.push(row);
  }

  if (!outRows.length) return { headers: [], rows: [] };

  const headers = outRows[0].map((h) => String(h ?? "").trim());
  const rows = outRows.slice(1).map((cells) => {
    const r: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) r[headers[i]] = String(cells[i] ?? "");
    return r;
  });

  return { headers, rows };
}

function pickField(row: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(row || {});
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().trim() === c.toLowerCase().trim());
    if (hit && row[hit] !== undefined && row[hit] !== null && String(row[hit]).trim() !== "") {
      return String(row[hit]).trim();
    }
  }
  return "";
}

function parseDateToIsoMaybe(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const normalized = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  if (!Number.isNaN(normalized.getTime())) return normalized.toISOString();

  return "";
}

function normalizeOrderStatus(raw: any) {
  const s = normStatusUpper(raw);
  if (!s) return "UNKNOWN";
  if (s.includes("REFUND") || s.includes("RMA")) return "REFUNDED";
  if (s.includes("CHARGEBACK") || s.includes("CHARGEDBACK") || s.includes("DISPUTE")) return "CHARGEBACK";
  if (s.includes("CANCEL") || s.includes("VOID") || s.includes("ABANDON")) return "CANCELLED";
  if (s.includes("DECLIN") || s.includes("REJECT") || s.includes("INVALID") || s.includes("ERROR") || s.includes("FAILED")) return "DECLINED";
  if (s.includes("PENDING") || s.includes("PROCESS") || s.includes("HOLD") || s.includes("REVIEW")) return "PENDING";
  if (s.includes("PAID") || s.includes("COMPLETE") || s.includes("SHIP") || s.includes("SUCCESS") || s.includes("NEW")) return "COMPLETED";
  return s;
}

function normalizeEmail(v: any) {
  const email = String(v ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : "";
}

async function sha256Hex(v: string) {
  if (!v) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function emailIdentityFields(emailRaw: any) {
  const email = String(emailRaw ?? "").trim();
  const emailNorm = normalizeEmail(email);
  const emailHash = emailNorm ? await sha256Hex(emailNorm) : "";

  return {
    customer_email: email || null,
    customer_email_normalized: emailNorm || null,
    customer_email_hash: emailHash || null,
  };
}

function normalizePhone(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function rawPayloadPresent(v: any) {
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim() !== "";
}

function pickTrackingId(row: Record<string, any>) {
  return (
    pickField(row, [
      "tkid",
      "tk_id",
      "tracekit_id",
      "TraceKit ID",
      "TraceKitID",
      "custom1",
      "custom2",
      "custom3",
      "custom4",
      "custom5",
      "customField1",
      "customField2",
      "customField3",
      "customField4",
      "customField5",
    ]) || ""
  );
}

function pickEverflowTid(row: Record<string, any>) {
  return (
    pickField(row, [
      "_ef_transaction_id",
      "ef_transaction_id",
      "everflow_transaction_id",
      "Everflow Transaction ID",
      "EF Transaction ID",
      "sub5",
      "Sub5",
      "SUB5",
      "s5",
      "S5",
    ]) || ""
  );
}

const wowSuiteNormalizeStatus = normalizeOrderStatus;

function dedupePlatformOrders(rows: any[]) {
  const map = new Map<string, any>();

  for (const r of rows) {
    const key = String(r.platform_order_id ?? "").trim();
    if (!key) continue;

    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      continue;
    }

    const prevStatus = String(prev.status ?? "");
    const nextStatus = String(r.status ?? "");

    let keep = prev;
    if ((!prevStatus || prevStatus === "UNKNOWN") && nextStatus && nextStatus !== "UNKNOWN") keep = r;
    else if (Number(r.gross_amount ?? 0) !== 0 && Number(prev.gross_amount ?? 0) === 0) keep = r;
    else if (String(r.order_ts ?? "") > String(prev.order_ts ?? "")) keep = r;

    map.set(key, keep);
  }

  return Array.from(map.values());
}

type ImportJobRow = {
  id: string;
  platform: string;
  module: string | null;
  status: "queued" | "running" | "completed" | "failed";
  from_date: string;
  to_date: string;
  filter: string | null;
  requested_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  fetched?: number;
  upserted?: number;
  pages?: number;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function createImportJob(env: Env, args: { platform: string; module?: string | null; from: string; to: string; filter?: string | null }) {
  const supabase = getSupabase(env);

  const payload = {
    platform: args.platform,
    module: args.module ?? null,
    status: "queued",
    from_date: args.from,
    to_date: args.to,
    filter: args.filter ?? null,
    requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("integration_import_jobs").insert(payload).select("*").single();
  if (error) throw new Error(`Failed to create import job: ${error.message}`);

  return data as ImportJobRow;
}

async function updateImportJob(env: Env, jobId: string, patch: Partial<ImportJobRow> & Record<string, any>) {
  const supabase = getSupabase(env);
  const { error } = await supabase
    .from("integration_import_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to update import job: ${error.message}`);
}

async function getImportJob(env: Env, jobId: string) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("integration_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`Failed to read import job: ${error.message}`);
  return (data ?? null) as ImportJobRow | null;
}

async function getLatestCredential(env: Env, platform: string) {
  const supabase = getSupabase(env);
  const keys =
	  platform === "checkoutchamp"
	    ? ["checkoutchamp"]
	    : [coercePlatformKey(platform), platform];

  const { data, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", keys)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`${platform} creds read failed: ${error.message}`);
  return data as any | null;
}

async function saveCredential(env: Env, args: { platform: string; baseUrl: string; username: string; password: string }) {
  const supabase = getSupabase(env);
  const platform = coercePlatformKey(args.platform);
  const encrypted = await encryptSecret(env, args.password);

  const payload = {
    platform,
    base_url: String(args.baseUrl || "").trim().replace(/\/+$/, ""),
    username: String(args.username || "").trim(),
    password_iv: encrypted.iv_b64,
    password_ciphertext: encrypted.ct_b64,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("integrations_credentials").upsert(payload as any, { onConflict: "platform" });
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);

  return payload;
}

function extractArrayFromResponse(js: any): any[] {
  if (Array.isArray(js)) return js;
  if (Array.isArray(js?.data)) return js.data;
  if (Array.isArray(js?.orders)) return js.orders;
  if (Array.isArray(js?.message?.data)) return js.message.data;
  if (Array.isArray(js?.result?.data)) return js.result.data;
  if (Array.isArray(js?.results)) return js.results;
  return [];
}

async function testCheckoutChampConnection(args: { baseUrl: string; username: string; password: string }) {
  const base = String(args.baseUrl || DEFAULT_CC_BASE).replace(/\/+$/, "");
  const today = new Date();

  const url = new URL(`${base}/order/query/`);
  url.searchParams.set("loginId", args.username);
  url.searchParams.set("password", args.password);
  url.searchParams.set("startDate", fmtCcMdYy(today));
  url.searchParams.set("endDate", fmtCcMdYy(today));
  url.searchParams.set("resultsPerPage", "1");
  url.searchParams.set("page", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
  });

  const text = await readTextSafe(res);
  const parsed = safeJsonParse(text);
  const resultText = String(parsed?.result || parsed?.status || parsed?.message || "");
  const looksOk = res.ok && !resultText.toUpperCase().includes("ERROR") && !resultText.toUpperCase().includes("FAIL");

  return {
    ok: looksOk,
    http_status: res.status,
    parsed,
    response_snippet: text.slice(0, 500),
  };
}

async function queryCheckoutChampOrders(args: {
  baseUrl: string;
  username: string;
  password: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  filter?: string | null;
}) {
  const fromDt = parseYmd(args.from);
  const toDt = parseYmd(args.to);
  if (!fromDt || !toDt) throw new Error("from/to must be YYYY-MM-DD");

  const url = new URL(`${args.baseUrl.replace(/\/+$/, "")}/order/query/`);
  url.searchParams.set("loginId", args.username);
  url.searchParams.set("password", args.password);
  url.searchParams.set("startDate", fmtCcMdYy(fromDt));
  url.searchParams.set("endDate", fmtCcMdYy(toDt));
  url.searchParams.set("resultsPerPage", String(args.pageSize));
  url.searchParams.set("page", String(args.page));

  const filter = String(args.filter || "all_sales").toLowerCase();
  if (filter && filter !== "all_sales") url.searchParams.set("orderStatus", filter);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url.toString(),
        {
          method: "GET",
          headers: { Accept: "application/json, text/plain, */*" },
        },
        30000,
      );

      const text = await readTextSafe(res);
      const retryableStatus = res.status === 429 || res.status >= 500;

      if (!res.ok) {
        const err = new Error(`CheckoutChamp order query failed (${res.status}): ${text.slice(0, 300)}`);
        if (retryableStatus && attempt < 3) {
          lastError = err;
          await sleepMs(500 * attempt);
          continue;
        }
        throw err;
      }

      const js = safeJsonParse(text);
      if (!js) throw new Error(`CheckoutChamp order query returned invalid JSON: ${text.slice(0, 300)}`);

      return js;
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt >= 3) break;
      await sleepMs(500 * attempt);
    }
  }

  throw lastError || new Error("CheckoutChamp order query failed.");
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickProductName(row: Record<string, any>) {
  return pickField(row, [
    "productName",
    "ProductName",
    "Product Name",
    "product_name",
    "productDescription",
    "Product Description",
    "name",
    "title",
  ]);
}

function pickProductSku(row: Record<string, any>) {
  return pickField(row, [
    "sku",
    "SKU",
    "SKUId",
    "skuId",
    "productSku",
    "product_sku",
    "productId",
    "product_id",
  ]);
}

function enrichCheckoutChampRaw(order: any) {
  const productName = pickProductName(order);
  const sku = pickProductSku(order);

  if (!productName && !sku) return order;

  return {
    ...order,
    productName: order.productName ?? (productName || undefined),
    product_name: order.product_name ?? (productName || undefined),
    sku: order.sku ?? (sku || undefined),
  };
}

async function normalizeCheckoutChampOrder(order: any) {
  const id = pickField(order, ["orderId", "order_id", "orderID", "id", "orderNumber", "order_number"]);
  if (!id) return null;

  const statusRaw = pickField(order, [
    "orderStatus",
    "status",
    "order_status",
    "paymentStatus",
    "transactionStatus",
    "responseType",
    "responseText",
  ]);
  const status = normalizeOrderStatus(statusRaw);

  const ts =
    parseDateToIsoMaybe(
      pickField(order, [
        "dateCreated",
        "createdAt",
        "createDate",
        "orderDate",
        "date",
        "lastUpdated",
        "updatedAt",
        "dateUpdated",
      ])
    ) || new Date().toISOString();

  let gross = parseMoneyMaybe(
    pickField(order, [
      "totalAmount",
      "orderTotal",
      "total",
      "amount",
      "price",
      "gross",
      "revenue",
      "order_total",
      "total_amount",
    ])
  );
  if (gross == null) gross = 0;
  if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
    gross = -Math.abs(gross);
  }

  const emailFields = await emailIdentityFields(
    pickField(order, ["email", "customerEmail", "emailAddress", "shipEmail", "billingEmail", "billing_email"])
  );

  const phone = normalizePhone(
    pickField(order, ["phone", "customerPhone", "phoneNumber", "shipPhone", "billingPhone", "phone_number"])
  );

  const transactionId =
    pickField(order, [
      "transactionId",
      "transaction_id",
      "authId",
      "paymentId",
      "payment_id",
      "gatewayTransactionId",
      "gateway_transaction_id",
    ]) || null;

  const everflowTid = pickEverflowTid(order) || null;

  return {
    platform: "checkoutchamp",
    platform_order_id: `checkoutchamp:${id}`,
    platform_store_id: pickField(order, ["campaignId", "campaign_id", "merchantId", "storeId"]) || null,
    order_id: String(id),
    order_ts: ts,
    status,
    status_norm: status,
    gross_amount: gross,
    currency: pickField(order, ["currency", "currencyCode"]) || "USD",

    ...emailFields,
    email: emailFields.customer_email,
    phone: phone || null,

    transaction_id: transactionId,
    everflow_transaction_id: everflowTid || null,
    tkid: pickTrackingId(order) || null,
    affiliate_id: pickField(order, ["affiliateId", "affiliate_id", "affId", "affid"]) || null,
    everflow_offer_id: pickField(order, ["offerId", "offer_id", "campaignId", "campaign_id"]) || null,
    source_id: pickField(order, ["sourceId", "source_id", "sid", "source"]) || null,
    sub1: pickField(order, ["sub1", "s1", "S1"]) || null,
    sub2: pickField(order, ["sub2", "s2", "S2"]) || null,
    sub3: pickField(order, ["sub3", "s3", "S3"]) || null,
    sub4: pickField(order, ["sub4", "s4", "S4"]) || null,
    sub5: pickField(order, ["sub5", "s5", "S5"]) || null,

    product_subtotal: parseMoneyMaybe(pickField(order, ["productSubtotal", "product_subtotal", "subtotal", "subTotal"])) ?? null,
    shipping_amount: parseMoneyMaybe(pickField(order, ["shippingAmount", "shipping", "shippingTotal", "shipping_total"])) ?? null,
    tax_amount: parseMoneyMaybe(pickField(order, ["taxAmount", "tax", "salesTax", "sales_tax"])) ?? null,
    product_cost: parseMoneyMaybe(pickField(order, ["productCost", "product_cost", "cogs"])) ?? null,
    shipping_cost: parseMoneyMaybe(pickField(order, ["shippingCost", "shipping_cost"])) ?? null,
    gateway_fee: parseMoneyMaybe(pickField(order, ["gatewayFee", "gateway_fee", "processorFee", "processor_fee"])) ?? null,
    chargeback_fee: parseMoneyMaybe(pickField(order, ["chargebackFee", "chargeback_fee"])) ?? null,
    tracking_number: pickField(order, ["trackingNumber", "tracking_number", "shipmentTrackingNumber"]) || null,
    shipping_carrier: pickField(order, ["shippingCarrier", "shipping_carrier", "carrier"]) || null,
    raw_json: enrichCheckoutChampRaw(order),
  };
}

type CheckoutChampLedgerEvent = {
  ledgerType: LedgerType;
  transactionId: string;
  parentTransactionId?: string | null;
  amount: number;
  status: string;
  reason: string;
  occurredAt: string;
  row: any;
};

function stableCheckoutChampEventId(row: any, ledgerType: LedgerType) {
  const base = String(
    row.platform_order_id ||
      (row.order_id ? `checkoutchamp:${row.order_id}` : "") ||
      row.transaction_id ||
      "unknown",
  ).trim();
  const externalTx = String(row.transaction_id || row.order_id || "").trim();
  return `${base}:${externalTx || "no-transaction"}:${ledgerType}`;
}

function buildCheckoutChampLedgerEvents(row: any): CheckoutChampLedgerEvent[] {
  const status = String(row.status || "").toUpperCase();
  const gross = Number(row.gross_amount ?? 0) || 0;
  const grossAbs = Math.abs(gross);
  const occurredAt = String(row.order_ts || new Date().toISOString());
  const events: CheckoutChampLedgerEvent[] = [];

  if (status === "COMPLETED" && gross > 0) {
    events.push({
      ledgerType: "sale",
      transactionId: stableCheckoutChampEventId(row, "sale"),
      parentTransactionId: row.transaction_id || null,
      amount: gross,
      status,
      reason: "Konnektive import sale",
      occurredAt,
      row,
    });
  }

  if (status === "REFUNDED" && grossAbs > 0) {
    events.push({
      ledgerType: "refund",
      transactionId: stableCheckoutChampEventId(row, "refund"),
      parentTransactionId: row.transaction_id || null,
      amount: grossAbs,
      status,
      reason: "Konnektive import refund",
      occurredAt,
      row,
    });
  }

  if (status === "CHARGEBACK" && grossAbs > 0) {
    events.push({
      ledgerType: "chargeback",
      transactionId: stableCheckoutChampEventId(row, "chargeback"),
      parentTransactionId: row.transaction_id || null,
      amount: grossAbs,
      status,
      reason: "Konnektive import chargeback",
      occurredAt,
      row,
    });
  }

  const chargebackFee = Math.abs(Number(row.chargeback_fee ?? 0) || 0);
  if (chargebackFee > 0) {
    events.push({
      ledgerType: "chargeback_fee",
      transactionId: stableCheckoutChampEventId(row, "chargeback_fee"),
      parentTransactionId: row.transaction_id || null,
      amount: chargebackFee,
      status: "chargeback_fee",
      reason: "Konnektive import chargeback fee",
      occurredAt,
      row,
    });
  }

  const processorFee = Math.abs(Number(row.gateway_fee ?? 0) || 0);
  if (processorFee > 0) {
    events.push({
      ledgerType: "processor_fee",
      transactionId: stableCheckoutChampEventId(row, "processor_fee"),
      parentTransactionId: row.transaction_id || null,
      amount: processorFee,
      status: "processor_fee",
      reason: "Konnektive import processor fee",
      occurredAt,
      row,
    });
  }

  return events;
}

async function insertCheckoutChampLedgerEvents(env: Env, rows: any[]) {
  const eventsById = new Map<string, CheckoutChampLedgerEvent>();

  for (const row of rows) {
    for (const event of buildCheckoutChampLedgerEvents(row)) {
      eventsById.set(event.transactionId, event);
    }
  }

  const events = Array.from(eventsById.values());
  if (!events.length) return { inserted: 0, skipped: 0 };

  const supabase = getSupabase(env);
  const eventIds = events.map((event) => event.transactionId);
  const existingIds = new Set<string>();

  for (let i = 0; i < eventIds.length; i += 100) {
    const chunk = eventIds.slice(i, i + 100);
    const { data: existing, error: existingError } = await supabase
      .from("conversions")
      .select("transaction_id")
      .eq("platform", "checkoutchamp")
      .in("transaction_id", chunk);

    if (existingError) throw new Error(`Konnektive ledger dedupe failed: ${existingError.message}`);

    for (const row of existing || []) {
      existingIds.add(String((row as any).transaction_id || ""));
    }
  }
  const rowsToInsert = events
    .filter((event) => !existingIds.has(event.transactionId))
    .map((event) => {
      const row = event.row;
      const amountCents = normalizeLedgerAmount(event.ledgerType, toCents(event.amount));

      return {
        workspace_id: "default",
        ledger_type: event.ledgerType,
        tkid: row.tkid || null,
        email: row.email || row.customer_email || null,
        phone: row.phone || null,
        order_id: row.order_id || null,
        transaction_id: event.transactionId,
        parent_transaction_id: event.parentTransactionId || null,
        amount: amountCents / 100,
        currency: row.currency || "USD",
        platform: "checkoutchamp",
        source_system: "konnektive",
        network: null,
        affiliate_id: row.affiliate_id || null,
        campaign_id: row.platform_store_id || null,
        offer_id: row.everflow_offer_id || null,
        status: event.status,
        reason: event.reason,
        raw: row.raw_json || row,
        meta: {
          external_event_id: event.transactionId,
          platform_order_id: row.platform_order_id || null,
          original_transaction_id: row.transaction_id || null,
          source: "konnektive_import",
        },
        occurred_at: event.occurredAt,
      };
    });

  if (!rowsToInsert.length) return { inserted: 0, skipped: events.length };

  const { error: insertError } = await supabase.from("conversions").insert(rowsToInsert);
  if (insertError) throw new Error(`Konnektive ledger insert failed: ${insertError.message}`);

  return {
    inserted: rowsToInsert.length,
    skipped: events.length - rowsToInsert.length,
  };
}

async function runCheckoutChampImport(env: Env, args: RunImportArgs) {
  const creds = await getLatestCredential(env, "checkoutchamp");
  if (!creds) throw new Error("CheckoutChamp/Konnektive not connected. Save credentials first.");

  const username = String(creds.username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds);
  const baseUrl = String(creds.base_url || env.DEFAULT_CC_BASE || DEFAULT_CC_BASE).replace(/\/+$/, "");
  const pageSize = Math.max(1, Math.min(200, Number(args.pageSize ?? 200)));
  const supabase = getSupabase(env);

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let ledgerInserted = 0;
  let ledgerSkipped = 0;
  const maxPages = 250;

  while (page <= maxPages) {
    const js = await queryCheckoutChampOrders({
      baseUrl,
      username,
      password,
      from: args.from,
      to: args.to,
      page,
      pageSize,
      filter: args.filter,
    });

    const rawRows = extractArrayFromResponse(js);
    totalFetched += rawRows.length;

    const normalizedRows = await Promise.all(rawRows.map((o: any) => normalizeCheckoutChampOrder(o)));
	const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));

    if (rows.length) {
      const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
      if (error) throw new Error(`CheckoutChamp DB upsert failed: ${error.message}`);
      totalUpserted += rows.length;

      const ledgerResult = await insertCheckoutChampLedgerEvents(env, rows);
      ledgerInserted += ledgerResult.inserted;
      ledgerSkipped += ledgerResult.skipped;
    }

    const totalResults = Number(js.totalResults ?? js.total_results ?? js.total ?? 0);
    if (!rawRows.length || rawRows.length < pageSize || (totalResults && page * pageSize >= totalResults)) break;

    page += 1;
  }

  return {
    fetched: totalFetched,
    upserted: totalUpserted,
    pages: page,
    ledger_inserted: ledgerInserted,
    ledger_skipped: ledgerSkipped,
  };
}

type WowBoostExportResp = { link?: string; hasMoreToExport?: boolean; nextExport?: string };

async function wowBoostExportPage(args: { exportBase: string; bearer: string; page: number; pageSize: number; fromYmd: string; toYmd: string }) {
  const url = new URL(`${args.exportBase.replace(/\/+$/, "")}/order/export/${args.page}/${args.pageSize}`);
  url.searchParams.set("StartDate", args.fromYmd);
  url.searchParams.set("EndDate", args.toYmd);

  const res = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `bearer ${args.bearer}`,
      Accept: "application/json, text/plain, */*",
    },
  }, 30000);

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`WowBoost export failed (${res.status}): ${text || res.statusText}`);

  const js = safeJsonParse(text) as WowBoostExportResp | null;
  if (!js) throw new Error(`WowBoost export: invalid JSON: ${text.slice(0, 200)}`);

  const link = String(js.link ?? "").trim();
  if (!link) throw new Error(`WowBoost export: missing CSV link. resp=${text.slice(0, 200)}`);

  return { link, hasMore: Boolean(js.hasMoreToExport) };
}

async function runWowSuiteWowBoostImport(env: Env, args: { from: string; to: string; pageSize?: number; debug?: boolean }) {
  const supabase = getSupabase(env);

  const { data: creds, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
  if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);

  if (!parseYmd(args.from) || !parseYmd(args.to)) throw new Error("from/to must be YYYY-MM-DD");

  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });
  const pageSize = Math.max(1, Math.min(2000, Number(args.pageSize ?? 1000)));

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  const maxPages = 250;

  while (page <= maxPages) {
    const exp = await wowBoostExportPage({ exportBase, bearer, page, pageSize, fromYmd: args.from, toYmd: args.to });

    const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
    const csvText = await readTextSafe(csvRes);
    if (!csvRes.ok) throw new Error(`WowBoost CSV download failed (${csvRes.status}): ${csvText.slice(0, 160)}`);

    const parsed = parseCsv(csvText);
    totalFetched += parsed.rows.length;

    const upserts = await Promise.all(
      parsed.rows.map(async (r) => {
        const orderId =
          pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "orderid", "Id", "ID"]) ||
          pickField(r, ["Order Number", "OrderNumber", "orderNumber", "Master Order Number", "MasterOrderNumber"]);

        if (!orderId) return null;

        const status = wowSuiteNormalizeStatus(
          pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
            pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus", "Payment Status"])
        );

        const isoTs =
          parseDateToIsoMaybe(
            pickField(r, ["Order Create Date", "createDate", "CreateDate", "orderDate", "OrderDate", "Date", "CreatedAt", "Created", "lastUpdateDate", "LastUpdateDate", "Updated Date"])
          ) || `${args.from}T00:00:00.000Z`;

        let gross = parseMoneyMaybe(
          pickField(r, [
            "Order Price USD",
            "Order Price",
            "productPrice",
            "Product Price",
            "ProductPrice",
            "Amount USD",
            "Amount",
            "AmountUSD",
            "Total",
            "OrderTotal",
            "Gross",
            "Revenue",
            "amount",
          ])
        );

        if (gross == null) gross = 0;
        if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) gross = -Math.abs(gross);

        const emailFields = await emailIdentityFields(
          pickField(r, ["CustomerEmail", "Customer Email", "Email", "email", "customerEmail"])
        );
        const phone = normalizePhone(pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"]));
        const transactionId =
          pickField(r, ["PaymentTrackingNumber", "Payment Tracking Number", "TransactionId", "Transaction ID", "transaction_id", "ReferenceId", "Reference ID"]) || null;
        const efTid = pickEverflowTid(r) || null;

        return {
          platform: "wowboost",
          platform_order_id: `wowboost:${orderId}`,
          platform_store_id: pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
          order_id: String(orderId),
          order_ts: isoTs,
          status: status || "UNKNOWN",
          status_norm: status || "UNKNOWN",
          gross_amount: gross,
          receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount", "AmountUSD", "amount"])) ?? null,
          currency: pickField(r, ["currencyCode", "CurrencyCode", "Currency", "currency", "Transaction Currency"]) || "USD",

          ...emailFields,
          email: emailFields.customer_email,
          phone: phone || null,

          transaction_id: transactionId,
          everflow_transaction_id: efTid,
          tkid: pickTrackingId(r) || null,
          affiliate_id: pickField(r, ["AffiliateId", "Affiliate ID", "affiliate_id", "Partner ID", "PartnerId"]) || null,
          everflow_offer_id: pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,
          source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
          sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
          sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
          sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
          sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
          sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,

          product_subtotal: parseMoneyMaybe(
			  pickField(r, [
			    "Order Price USD",
			    "Order Price",
			    "productPrice",
			    "Product Price",
			  ])
			) ?? null,
          shipping_amount: parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,
          tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
          product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
          shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
          gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
          chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,
          tracking_number: pickField(r, ["ShipmentTrackingNumber", "Shipment Tracking Number", "FulfillmentTrackingNumber", "Tracking Number"]) || null,
          shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
          raw_json: r,
        };
      })
    ).then((rows) => rows.filter(Boolean));

    const deduped = dedupePlatformOrders(upserts);

    if (deduped.length) {
      const { error: upErr } = await supabase.from("platform_orders").upsert(deduped as any[], { onConflict: "platform_order_id" });
      if (upErr) throw new Error(`WowBoost DB upsert failed: ${upErr.message}`);
      totalUpserted += deduped.length;
    }

    if (!exp.hasMore || parsed.rows.length === 0 || parsed.rows.length < pageSize) break;
    page += 1;
  }

  return { fetched: totalFetched, upserted: totalUpserted, pages: page };
}

async function runWowBoostImportJob(env: Env, args: { jobId: string; from: string; to: string; filter?: string | null; pageSize?: number; debug?: boolean }) {
  await updateImportJob(env, args.jobId, { status: "running", started_at: new Date().toISOString(), error: null });

  try {
    const res = await runWowSuiteWowBoostImport(env, { from: args.from, to: args.to, pageSize: args.pageSize, debug: args.debug });

    await updateImportJob(env, args.jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      fetched: Number(res.fetched ?? 0),
      upserted: Number(res.upserted ?? 0),
      pages: Number(res.pages ?? 0),
      error: null,
    });
  } catch (e: any) {
    await updateImportJob(env, args.jobId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: String(e?.message || e || "unknown"),
    });
    throw e;
  }
}

async function runScheduledCheckoutChampImport(env: Env) {
  const supabase = getSupabase(env);

  await supabase.from("integrations_settings").upsert(
    {
      platform: "checkoutchamp",
      auto_import_enabled: false,
      auto_import_interval_minutes: 60,
      auto_import_lookback_hours: 2,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "platform" }
  );

  const { data: s, error } = await supabase.from("integrations_settings").select("*").eq("platform", "checkoutchamp").maybeSingle();
  if (error) {
    console.error("[cron] settings read failed", error);
    return;
  }

  if (!s || !(s as any).auto_import_enabled) return;

  const lookbackHours = Math.max(1, Math.min(168, Number((s as any).auto_import_lookback_hours ?? 48)));
  const now = new Date();
  const from = isoYmdUTC(new Date(now.getTime() - lookbackHours * 3600000));
  const to = isoYmdUTC(now);

  await supabase
    .from("integrations_settings")
    .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("platform", "checkoutchamp");

  try {
    const res = await runCheckoutChampImport(env, { from, to, filter: "all_sales" });

    await supabase
      .from("integrations_settings")
      .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("platform", "checkoutchamp");

    console.log("[cron] checkoutchamp import ok", { from, to, ...res });
  } catch (e: any) {
    await supabase
      .from("integrations_settings")
      .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
      .eq("platform", "checkoutchamp");

    console.error("[cron] checkoutchamp import failed", e);
  }
}

async function handleTestConnect(req: Request, env: Env) {
  const body = await readJsonBody(req);
  const platform = coercePlatformKey(body.platform);
  const baseUrl = String(
    body.baseUrl || body.base_url || (platform === "checkoutchamp" ? env.DEFAULT_CC_BASE || DEFAULT_CC_BASE : DEFAULT_WOWSUITE_AUTH_BASE)
  ).replace(/\/+$/, "");
  const username = String(body.username || body.loginId || body.login_id || "").trim();
  const password = String(body.password || "");

  if (!platform || !baseUrl || !username || !password) {
    return json({ ok: false, message: "platform, baseUrl, username, and password are required." }, 400);
  }

  if (platform === "checkoutchamp") {
    const result = await testCheckoutChampConnection({ baseUrl, username, password });
    return json(
      {
        platform,
        message: result.ok ? "Connection successful." : "Connection failed.",
        ...result,
      },
      result.ok ? 200 : 400
    );
  }

  if (platform.startsWith("wowsuite") || platform === "wowsuite") {
    const token = await wowSuiteGetBearerToken({ authBase: baseUrl, username, password });
    return json({ ok: true, platform, message: "Connection successful.", token_preview: `${token.slice(0, 8)}…` });
  }

  return json({ ok: false, message: `Unsupported platform: ${platform}` }, 400);
}

async function handleSaveCredentials(req: Request, env: Env) {
  const body = await readJsonBody(req);
  const platform = coercePlatformKey(body.platform);
  const baseUrl = String(
    body.baseUrl || body.base_url || (platform === "checkoutchamp" ? env.DEFAULT_CC_BASE || DEFAULT_CC_BASE : DEFAULT_WOWSUITE_AUTH_BASE)
  ).replace(/\/+$/, "");
  const username = String(body.username || body.loginId || body.login_id || "").trim();
  const password = String(body.password || "");

  if (!platform || !baseUrl || !username || !password) {
    return json({ ok: false, message: "platform, baseUrl, username, and password are required." }, 400);
  }

  await saveCredential(env, { platform, baseUrl, username, password });

  return json({ ok: true, platform, message: "Credentials saved." });
}

async function runNmiImportPage(env: Env, args: { from: string; to: string; offset?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));
  const offset = Math.max(0, Number(args.offset ?? 0));

  const creds = await getLatestCredential(env, "nmi:lifeheater14090");
  if (!creds) throw new Error("NMI not connected.");

  const apiKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://api.nmi.com").replace(/\/+$/, "");

  const auth = btoa(`api_key:${apiKey}`);

	const res = await fetch(`${baseUrl}/api/v4/transactions/reports`, {
	  method: "POST",
	  headers: {
		  Authorization: apiKey.trim(),
		  "Content-Type": "application/json",
		  Accept: "application/json",
		},
	  body: JSON.stringify({
	    maxResults: pageSize,
	    offset,
	    date: {
	      startDate: args.from,
	      endDate: args.to,
	    },
	  }),
	});

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`NMI transaction report failed ${res.status}: ${text.slice(0, 500)}`);

  const js = safeJsonParse(text);
  if (!js) throw new Error(`NMI returned invalid JSON: ${text.slice(0, 500)}`);

  const rows =
    Array.isArray(js.data) ? js.data :
    Array.isArray(js.transactions) ? js.transactions :
    Array.isArray(js.results) ? js.results :
    [];

  const upserts = await Promise.all(
    rows.map(async (t: any) => {
    const id = String(t.transactionId ?? t.transactionID ?? t.id ?? t.transaction_id ?? "").trim();
    if (!id) return null;

    const status = normalizeOrderStatus(t.status ?? t.condition ?? t.responseText ?? t.actionType);
    let gross = parseMoneyMaybe(t.amount ?? t.amountAuthorized ?? t.settlementAmount ?? t.totalAmount);
    if (gross == null) gross = 0;

    if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
      gross = -Math.abs(gross);
    }

    const emailFields = await emailIdentityFields(t.email ?? t.customerEmail ?? t.billingEmail ?? t.billing?.email);
    const phone = normalizePhone(t.phone ?? t.customerPhone ?? t.billingPhone ?? t.billing?.phone);
    const orderId = String(t.orderId ?? t.orderID ?? t.order_id ?? t.orderNumber ?? t.invoiceNumber ?? id).trim();

    return {
      platform: "nmi:lifeheater14090",
      platform_order_id: `nmi:lifeheater14090:${id}`,
      order_id: orderId || id,
      order_ts: parseDateToIsoMaybe(t.createdAt ?? t.date ?? t.transactionDate ?? t.actionDate) || `${args.from}T00:00:00.000Z`,
      status,
      status_norm: status,
      gross_amount: gross,
      currency: t.currency ?? "USD",

      ...emailFields,
      email: emailFields.customer_email,
      phone: phone || null,
      transaction_id: id,
      raw_json: t,
    };
    })
  ).then((rows) => rows.filter(Boolean));

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: rows.length,
    upserted: deduped.length,
    offset,
    pageSize,
    hasMore: rows.length >= pageSize,
    nextOffset: rows.length >= pageSize ? offset + pageSize : null,
    rawKeys: Object.keys(js || {}),
  };
}

function nmiClassicDate(ymd: string, end = false) {
  return `${ymd.replace(/-/g, "")}${end ? "235959" : "000000"}`;
}

function xmlValue(block: string, tag: string) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : "";
}

function xmlBlocks(xml: string, tag: string) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function runNmiClassicImportPage(env: Env, args: { from: string; to: string; page?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "nmi:lifeheater14090");
  if (!creds) throw new Error("NMI LifeHeater14090 not connected.");

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`NMI classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    const emailFields = {
      customer_email: null,
      customer_email_normalized: null,
      customer_email_hash: null,
    };

    return {
      platform: "nmi:lifeheater14090",
      platform_order_id: `nmi:lifeheater14090:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      ...emailFields,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}

async function runPayDiverseClassicImportPage(env: Env, args: { from: string; to: string; page?: number; pageSize?: number }) {
  const supabase = getSupabase(env);
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  const creds = await getLatestCredential(env, "paydiverse");
  if (!creds) throw new Error("PayDiverse not connected.");

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://paydiverse.transactiongateway.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`PayDiverse classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    return {
      platform: "paydiverse",
      platform_order_id: `paydiverse:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}

async function runGatewayClassicImportPage(env: Env, args: {
  platform: string;
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = getSupabase(env);
  const platform = String(args.platform || "").trim();
  const page = Math.max(0, Number(args.page ?? 0));
  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));

  if (!platform) throw new Error("platform is required");

  const creds = await getLatestCredential(env, platform);
  if (!creds) throw new Error(`${platform} not connected.`);

  const securityKey = await decryptSecretFromCredRow(env, creds as any);
  const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

  const form = new URLSearchParams();
  form.set("security_key", securityKey.trim());
  form.set("start_date", nmiClassicDate(args.from, false));
  form.set("end_date", nmiClassicDate(args.to, true));
  form.set("result_limit", String(pageSize));
  form.set("page_number", String(page));
  form.set("result_order", "standard");
  form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

  const res = await fetch(`${baseUrl}/api/query.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const xml = await readTextSafe(res);
  if (!res.ok) throw new Error(`Gateway classic query failed ${res.status}: ${xml.slice(0, 500)}`);

  const transactions = xmlBlocks(xml, "transaction");

  const upserts = transactions.map((tx) => {
    const id = xmlValue(tx, "transaction_id");
    if (!id) return null;

    const condition = xmlValue(tx, "condition");
    const currency = xmlValue(tx, "currency") || "USD";
    const actions = xmlBlocks(tx, "action");
    const primaryAction = actions.find((a) => xmlValue(a, "action_type") === "sale") || actions[0] || "";

    const actionType = xmlValue(primaryAction, "action_type");
    const actionDate = xmlValue(primaryAction, "date");
    const amountRaw = xmlValue(primaryAction, "amount") || xmlValue(primaryAction, "requested_amount");

    let status = normalizeOrderStatus(condition || actionType || xmlValue(primaryAction, "response_text"));
    let gross = parseMoneyMaybe(amountRaw);
    if (gross == null) gross = 0;

    if (
      actionType === "refund" ||
      actionType === "credit" ||
      actionType === "return" ||
      status === "REFUNDED" ||
      status === "CHARGEBACK" ||
      status === "CANCELLED"
    ) {
      gross = -Math.abs(gross);
    }

    const isoTs = actionDate
      ? `${actionDate.slice(0, 4)}-${actionDate.slice(4, 6)}-${actionDate.slice(6, 8)}T${actionDate.slice(8, 10)}:${actionDate.slice(10, 12)}:${actionDate.slice(12, 14)}.000Z`
      : `${args.from}T00:00:00.000Z`;

    const rawJson = {
      transaction_id: id,
      condition,
      action_type: actionType,
      action_date: actionDate,
      amount: amountRaw,
      currency,
      xml: tx,
    };

    return {
      platform,
      platform_order_id: `${platform}:${id}`,
      order_id: id,
      order_ts: isoTs,
      status,
      status_norm: status,
      gross_amount: gross,
      currency,
      transaction_id: id,
      raw_json: rawJson,
    };
  }).filter(Boolean);

  const deduped = dedupePlatformOrders(upserts);

  if (deduped.length) {
    const { error } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (error) throw new Error(error.message);
  }

  return {
    fetched: transactions.length,
    upserted: deduped.length,
    page,
    pageSize,
    hasMore: transactions.length >= pageSize,
    nextPage: transactions.length >= pageSize ? page + 1 : null,
  };
}


async function rebuildCustomerProfiles(env: Env) {
  const supabase = getSupabase(env);
  const { error: deleteError } = await supabase
	  .from("customer_profiles")
	  .delete()
	  .not("identity_key", "is", null);
	
	if (deleteError) {
	  throw new Error(deleteError.message);
	}
  
  const allOrders: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("platform_orders")
      .select(
        "platform_order_id, identity_key, customer_email, customer_email_normalized, email, phone, gross_amount, order_ts"
      )
      .not("identity_key", "is", null)
      .order("platform_order_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    allOrders.push(...(data || []));

    if (!data || data.length < pageSize) break;

    offset += pageSize;
  }

  const grouped = new Map<string, any>();

  for (const o of allOrders) {
    const key = String(o.identity_key || "").trim();
    if (!key) continue;

    const gross = Number(o.gross_amount || 0);
    const ts = o.order_ts ? new Date(o.order_ts).toISOString() : null;

    const existing = grouped.get(key) || {
      identity_key: key,
      primary_email:
        o.customer_email_normalized || o.customer_email || o.email || null,
      primary_phone: o.phone || null,
      order_count: 0,
      lifetime_revenue: 0,
      first_order_ts: ts,
      last_order_ts: ts,
    };

    existing.order_count += 1;
    existing.lifetime_revenue += Number.isFinite(gross) ? gross : 0;

    if (!existing.primary_email) {
      existing.primary_email =
        o.customer_email_normalized || o.customer_email || o.email || null;
    }

    if (!existing.primary_phone && o.phone) {
      existing.primary_phone = o.phone;
    }

    if (ts) {
      if (!existing.first_order_ts || ts < existing.first_order_ts) {
        existing.first_order_ts = ts;
      }

      if (!existing.last_order_ts || ts > existing.last_order_ts) {
        existing.last_order_ts = ts;
      }
    }

    grouped.set(key, existing);
  }

  const profiles = Array.from(grouped.values()).map((p) => ({
    identity_key: p.identity_key,
    primary_email: p.primary_email,
    primary_phone: p.primary_phone,
    order_count: p.order_count,
    lifetime_revenue: p.lifetime_revenue,
    average_order_value:
      p.order_count > 0 ? p.lifetime_revenue / p.order_count : 0,
    first_order_ts: p.first_order_ts,
    last_order_ts: p.last_order_ts,
    updated_at: new Date().toISOString(),
  }));

  const batchSize = 500;

	for (let i = 0; i < profiles.length; i += batchSize) {
	  const batch = profiles.slice(i, i + batchSize);
	
	  const { error: upsertError } = await supabase
	    .from("customer_profiles")
	    .upsert(batch, { onConflict: "identity_key" });
	
	  if (upsertError) throw new Error(upsertError.message);
	}

  return {
    scanned_orders: allOrders.length,
    rebuilt_profiles: profiles.length,
  };
}


async function router(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return corsPreflight();

  if (path === "/__ping" && req.method === "GET") {
    return json({ ok: true, path, now: new Date().toISOString() });
  }
  
  if (path.startsWith("/v1/postbacks/") && req.method === "POST") {
  const platform = path.split("/").pop() || "unknown";
  const payload = await readJsonBody(req);

  const ledgerType = detectLedgerType(payload);

  const amountCents = normalizeLedgerAmount(
    ledgerType,
    toCents(
      payload.amount ??
        payload.sale_amount ??
        payload.total ??
        payload.fee ??
        payload.chargeback_fee ??
        payload.refund_amount
    )
  );

  const ledgerRow = {
    workspace_id: payload.workspace_id || "default",
    ledger_type: ledgerType,
    tkid: payload.tkid || null,
    email: payload.email || payload.customer_email || null,
    phone: payload.phone || null,
    order_id: payload.order_id || payload.orderNumber || payload.order_number || null,
    transaction_id: payload.transaction_id || payload.transactionId || null,
    parent_transaction_id:
      payload.parent_transaction_id || payload.parentTransactionId || null,
    amount: amountCents / 100,
    currency: payload.currency || "USD",
    platform,
    source_system: platform,
    network: payload.network || null,
    affiliate_id: payload.affiliate_id || payload.affid || null,
    campaign_id: payload.campaign_id || payload.oid || null,
    offer_id: payload.offer_id || payload.oid || null,
    status: payload.status || ledgerType,
    reason: payload.reason || null,
    raw: payload,
    meta: payload,
    occurred_at:
      payload.occurred_at || payload.created_at || new Date().toISOString(),
  };

  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("conversions")
    .insert(ledgerRow)
    .select("*")
    .single();

  if (error) {
    return json(
      { ok: false, error: "ledger_insert_failed", message: error.message },
      500
    );
  }

  return json({ ok: true, ledger: data });
}

  if (path === "/v1/integrations/test-connect" && req.method === "POST") {
    return handleTestConnect(req, env);
  }

  if (path === "/v1/integrations/save-credentials" && req.method === "POST") {
    return handleSaveCredentials(req, env);
  }

  if (path === "/v1/integrations/checkoutchamp/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "checkoutchamp");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "checkoutchamp",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "checkoutchamp",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }
  
  if (path === "/v1/platform-orders/detail" && req.method === "GET") {
	  try {
	    const platformOrderId = String(
	      url.searchParams.get("platform_order_id") || ""
	    ).trim();
	
	    if (!platformOrderId) {
	      return json(
	        {
	          ok: false,
	          error: "bad_request",
	          message: "platform_order_id is required",
	        },
	        400
	      );
	    }
	
	    const supabase = getSupabase(env);
	
	    const { data, error } = await supabase
	      .from("platform_orders")
	      .select("*")
	      .eq("platform_order_id", platformOrderId)
	      .maybeSingle();
	
	    if (error) throw new Error(error.message);
	
	    return json({
	      ok: true,
	      order: data || null,
	    });
	  } catch (e: any) {
	    return json(
	      {
	        ok: false,
	        error: "platform_order_detail_failed",
	        message: e?.message || String(e),
	      },
	      500
	    );
	  }
	}
  
  if (path === "/v1/customers/detail" && req.method === "GET") {
	  const identityKey = url.searchParams.get("identity_key");
	
	  if (!identityKey) {
	    return json({ ok: false, message: "identity_key required" }, 400);
	  }
	
	  const supabase = getSupabase(env);
	
	  const { data: customer, error: customerError } = await supabase
	    .from("customer_profiles")
	    .select("*")
	    .eq("identity_key", identityKey)
	    .maybeSingle();
	
	  if (customerError) {
	    return json({ ok: false, message: customerError.message }, 500);
	  }
	
	  const { data: orders, error: ordersError } = await supabase
	    .from("platform_orders")
	    .select("*")
	    .eq("identity_key", identityKey)
	    .order("order_ts", { ascending: false })
	    .limit(100);
	
	  if (ordersError) {
	    return json({ ok: false, message: ordersError.message }, 500);
	  }
	
	  return json({
	    ok: true,
	    customer,
	    orders: orders || [],
	  });
	}
	
	if (path === "/v1/customers/search" && req.method === "GET") {
  try {
    const q = String(url.searchParams.get("q") || "").trim();

    if (!q) {
      return json({ ok: true, results: [] });
    }

    const supabase = getSupabase(env);
    const safeQ = q.replace(/[%_]/g, "");

    const { data: orders, error: orderError } = await supabase
      .from("platform_orders")
      .select(
        "identity_key, customer_email, email, phone, order_id, platform_order_id, transaction_id, everflow_transaction_id, tkid, tracking_number, gross_amount, order_ts, platform"
      )
      .or(
        [
          `customer_email.ilike.%${safeQ}%`,
          `email.ilike.%${safeQ}%`,
          `phone.ilike.%${safeQ}%`,
          `order_id.ilike.%${safeQ}%`,
          `platform_order_id.ilike.%${safeQ}%`,
          `transaction_id.ilike.%${safeQ}%`,
          `everflow_transaction_id.ilike.%${safeQ}%`,
          `tkid.ilike.%${safeQ}%`,
          `tracking_number.ilike.%${safeQ}%`,
        ].join(",")
      )
      .not("identity_key", "is", null)
      .order("order_ts", { ascending: false })
      .limit(50);

    if (orderError) throw new Error(orderError.message);

    const identityKeys = Array.from(
      new Set((orders || []).map((o: any) => o.identity_key).filter(Boolean))
    );

    if (!identityKeys.length) {
      return json({ ok: true, results: [] });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("customer_profiles")
      .select("*")
      .in("identity_key", identityKeys);

    if (profileError) throw new Error(profileError.message);

    const profileByKey = new Map(
      (profiles || []).map((p: any) => [p.identity_key, p])
    );

    const results = identityKeys.map((identityKey) => {
      const profile = profileByKey.get(identityKey) || null;
      const matches = (orders || []).filter(
        (o: any) => o.identity_key === identityKey
      );

      return {
        identity_key: identityKey,
        customer: profile,
        matches,
        match_count: matches.length,
        latest_order_ts: matches[0]?.order_ts || profile?.last_order_ts || null,
        latest_order_id: matches[0]?.order_id || null,
        latest_platform: matches[0]?.platform || null,
      };
    });

    return json({
      ok: true,
      q,
      results,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "customer_search_failed",
        message: e?.message || String(e),
      },
      500
    );
  }
}
	
	if (path === "/v1/order-groups" && req.method === "GET") {
		  const supabase = getSupabase(env);
		  const identityKey = url.searchParams.get("identity_key");
		
		  let query = supabase
		    .from("order_groups")
		    .select("*")
		    .order("first_order_ts", { ascending: false });
		
		  if (identityKey) {
		    query = query.eq("identity_key", identityKey);
		  }
		
		  const { data, error } = await query;
		
		  if (error) {
		    return json(
		      {
		        ok: false,
		        message: error.message,
		      },
		      500
		    );
		  }
		
		  return json({
		    ok: true,
		    groups: data || [],
		  });
		}
		
		  if (path === "/v1/customers/rebuild" && req.method === "POST") {
		    try {
		      const result = await rebuildCustomerProfiles(env);
		
		      return json({
		        ok: true,
		        ...result,
		        message: `Rebuilt ${result.rebuilt_profiles} customer profiles.`,
		      });
		    } catch (e: any) {
		      return json(
		        {
		          ok: false,
		          error: "customers_rebuild_failed",
		          message: e?.message || String(e),
		        },
		        500
		      );
		    }
		  }
  
  

  if (path === "/v1/customers/by-identity" && req.method === "GET") {
    try {
      const identityKey = String(url.searchParams.get("identity_key") ?? "").trim();

      if (!identityKey) {
        return json(
          {
            ok: false,
            error: "bad_request",
            message: "identity_key is required",
          },
          400
        );
      }

      const supabase = getSupabase(env);

      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("identity_key", identityKey)
        .maybeSingle();

      if (error) throw new Error(error.message);

      return json({
        ok: true,
        customer: data ?? null,
      });
    } catch (e: any) {
      return json(
        {
          ok: false,
          error: "customer_lookup_failed",
          message: e?.message || String(e),
        },
        500
      );
    }
  }

if (path === "/v1/platforms" && req.method === "GET") {
  return json({
    ok: true,
    platforms: [
      { value: "checkoutchamp", label: "CheckoutChamp" },
      { value: "wowsuite", label: "WowSuite" },
      { value: "wowboost", label: "WowBoost" },
      { value: "wowpay", label: "WowPay" },
      { value: "nmi:lifeheater14090", label: "NMI • lifeheater14090" },
      { value: "nmi:tpaul9204", label: "NMI • tpaul9204" },
      { value: "paydiverse", label: "PayDiverse" },
    ],
  });
}

if (path === "/v1/product-costs/detected" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("detected_products")
      .select("*")
      .order("revenue", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      products: data || [],
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_detected_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-catalog/rebuild" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data: orders, error } = await supabase
      .from("platform_orders")
      .select("platform, gross_amount, order_ts, raw_json")
      .not("raw_json", "is", null)
      .order("order_ts", { ascending: false, nullsFirst: false })
      .range(0, 49999)

    if (error) throw new Error(error.message);

    const usableOrders = (orders || []).filter((order: any) => {
      const raw =
		  typeof order.raw_json === "string"
		    ? JSON.parse(order.raw_json || "{}")
		    : order.raw_json || {};
      return raw && typeof raw === "object" && Object.keys(raw).length > 0;
    });

    const products = new Map<string, any>();
    const now = new Date().toISOString();

    for (const order of usableOrders) {
      const raw = order.raw_json || {};
      const statusText = String(
		  raw["Order Status Name"] ||
		    raw["Receipt Status Name"] ||
		    raw.status ||
		    raw.orderStatus ||
		    order.status ||
		    "",
		).toLowerCase();
		
		const isNonSale =
		  statusText.includes("abandon") ||
		  statusText.includes("aborted") ||
		  statusText.includes("declin") ||
		  statusText.includes("cancel") ||
		  statusText.includes("void") ||
		  statusText.includes("failed");
		
		if (isNonSale || Number(order.gross_amount || 0) < 0) {
		  continue;
		}
      const ts = order.order_ts ? new Date(order.order_ts).toISOString() : null;

      let items: any[] = [];

      if (raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)) {
        items = Object.values(raw.items);
      } else if (Array.isArray(raw.items)) {
        items = raw.items;
      } else if (Array.isArray(raw.line_items)) {
        items = raw.line_items;
      } else if (Array.isArray(raw.lineItems)) {
        items = raw.lineItems;
      } else if (Array.isArray(raw.products)) {
        items = raw.products;
      } else if (Array.isArray(raw.orderItems)) {
        items = raw.orderItems;
      } else if (
		  raw["Product Name"] ||
		  raw.productName ||
		  raw.product_name ||
		  raw.name ||
		  raw.SKUId ||
		  raw.sku ||
		  raw.productSku ||
		  raw.productId ||
		  raw.product_id
		) {
		  items = [raw];
	  }
	  
	  const isWowBoost =
		  order.platform === "wowboost" ||
		  order.platform === "wowsuite:wowboost";

      for (const item of items) {
        const sku =
		  item.SKUId ||
		  item.skuId ||
		  item.productSku ||
		  item.product_sku ||
		  item.sku ||
		  item.SKU ||
		  null;

        const productId =
		  isWowBoost
		    ? item.SKUId ||
		      item.skuId ||
		      item.sku ||
		      item.SKU ||
		      null
		    : item.productId ||
		      item.product_id ||
		      item.actualProductId ||
		      item.currentProductId ||
		      item.externalProductId ||
		      item.id ||
		      null;

        const name =
		  item["Product Name"] ||
		  item.name ||
		  item.productName ||
		  item.product_name ||
		  item.title ||
		  item.productDescription ||
		  null;

        if (!productId && !sku && !name) continue;

        const key = [
          order.platform || "",
          productId || "",
          sku || "",
          name || "",
        ].join("|");

        if (!products.has(key)) {
          products.set(key, {
            platform: order.platform,
            external_product_id: productId ? String(productId) : null,
            sku: sku ? String(sku) : null,
            name: name ? String(name) : null,
            campaign_id:
              raw.campaignId ||
              raw.campaign_id ||
              item.campaignId ||
              item.campaign_id ||
              null,
            campaign_name:
              raw.campaignName ||
              raw.campaign_name ||
              item.campaignName ||
              item.campaign_name ||
              null,
            first_seen: ts,
            last_seen: ts,
            order_count: 0,
            revenue: 0,
            updated_at: now,
          });
        }

        const existing = products.get(key);

        const qty = Math.max(
          1,
          Number(item.qty || item.quantity || item.currentQty || 1) || 1,
        );
        // Skip abandoned/refunded WowBoost records
		if (
		  isWowBoost &&
		  Number(raw["Order Quantity (Units Sold)"] || 1) <= 0
		) {
		  continue;
		}
        let itemRevenue =
		  parseMoneyMaybe(
		    item.price ??
		      item.amount ??
		      item.total ??
		      item.productPrice ??
		      item.product_price ??
		      item.currentPrice ??
		      item.current_price ??
		      item.linePrice ??
		      item.line_price ??
		      item.finalLinePrice ??
		      item.final_line_price ??
		      item.discountedPrice ??
		      item.discounted_price ??
		      item.productSubtotal ??
		      item.product_subtotal ??
		      raw.productPrice ??
		      raw.product_price,
		  ) ?? 0;
		
		if (isWowBoost) {
		  itemRevenue =
		    parseMoneyMaybe(
		      item["Order Price USD"] ??
		      item["Order Price"] ??
		      raw["Order Price USD"] ??
		      raw["Order Price"]
		    ) ?? Number(order.gross_amount || 0);
		} else if (itemRevenue === 0) {
		  itemRevenue = Number(order.gross_amount || 0);
		}

        existing.order_count += 1;
        existing.revenue += itemRevenue;

        if (ts) {
          if (!existing.first_seen || ts < existing.first_seen) {
            existing.first_seen = ts;
          }

          if (!existing.last_seen || ts > existing.last_seen) {
            existing.last_seen = ts;
          }
        }
      }
    }

    const rows = Array.from(products.values());

    const { error: deleteError } = await supabase
      .from("product_catalog")
      .delete()
      .neq("id", 0);

    if (deleteError) throw new Error(deleteError.message);

    if (rows.length) {
      const { error: upsertError } = await supabase
        .from("product_catalog")
        .upsert(rows, {
          onConflict: "platform,external_product_id,sku,name,campaign_id",
        });

      if (upsertError) throw new Error(upsertError.message);
    }

    return json({
      ok: true,
      products_found: rows.length,
      orders_scanned: usableOrders.length,
      total_orders_checked: orders?.length || 0,
      skipped_empty_raw_json: (orders?.length || 0) - usableOrders.length,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_catalog_rebuild_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-catalog" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("product_catalog")
      .select("*")
      .order("revenue", { ascending: false, nullsFirst: false })
      .limit(50000);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      products: data || [],
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "product_catalog_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/product-costs/rules" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("product_cost_rules")
      .select("*")
      .order("platform", { ascending: true })
      .order("product_name", { ascending: true })
      .order("package_quantity", { ascending: true });

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      rules: data || [],
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_rules_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/apply" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data: orders, error: ordersError } = await supabase
      .from("platform_orders")
      .select("id, platform, gross_amount, raw_json")
      .not("raw_json", "is", null)
      .limit(50000);

    if (ordersError) throw new Error(ordersError.message);

    const { data: rules, error: rulesError } = await supabase
      .from("product_cost_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) throw new Error(rulesError.message);

    let updated = 0;
    let unmatched = 0;

    for (const order of orders || []) {
      const raw = order.raw_json || {};
      const items =
        raw.items && typeof raw.items === "object"
          ? Object.values(raw.items)
          : Array.isArray(raw.items)
            ? raw.items
            : Array.isArray(raw.line_items)
              ? raw.line_items
              : [];

      let productCost = 0;
      let shippingCost = 0;
      let matchedRuleId: number | null = null;

      for (const item of items as any[]) {
        const sku =
          item.productSku ||
          item.product_sku ||
          item.sku ||
          null;

        const name =
          item.name ||
          item.productName ||
          item.product_name ||
          item.title ||
          null;

        const qty = Number(item.qty || item.quantity || 1);

        const rule = (rules || []).find((r: any) => {
          return (
            r.platform === order.platform &&
            (
              (r.sku && sku && r.sku === sku) ||
              (r.product_name && name && r.product_name === name)
            )
          );
        });

        if (rule) {
          matchedRuleId = rule.id;
          productCost += Number(rule.package_cost || 0);
          shippingCost += Number(rule.shipping_cost || 0);
        }
      }

      if (!matchedRuleId) {
        unmatched++;
        continue;
      }

      const totalCost = productCost + shippingCost;
      const grossProfit = gross - totalCost;
      const marginPct = gross > 0 ? (grossProfit / gross) * 100 : 0;

      const { error: updateError } = await supabase
        .from("platform_orders")
        .update({
          applied_product_cost: productCost,
          applied_shipping_cost: shippingCost,
          applied_total_cost: totalCost,
          gross_profit: grossProfit,
          gross_margin_pct: marginPct,
          cost_rule_id: matchedRuleId,
          cost_applied_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) throw new Error(updateError.message);

      updated++;
    }

    return json({
      ok: true,
      orders_scanned: orders?.length || 0,
      updated,
      unmatched,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "cost_apply_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/rules" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const payload = {
      id: body.id || undefined,
      platform: String(body.platform || "").trim() || null,
      product_name: String(body.product_name || "").trim() || null,
      sku: String(body.sku || "").trim() || null,
      product_type: String(body.product_type || "physical").trim(),
      package_quantity: Math.max(1, Number(body.package_quantity || 1)),
      package_cost: Math.max(0, Number(body.package_cost || 0)),
      shipping_cost: Math.max(0, Number(body.shipping_cost || 0)),
      allow_unit_fallback: Boolean(body.allow_unit_fallback),
      currency: String(body.currency || "USD").trim() || "USD",
      effective_from: body.effective_from || new Date().toISOString(),
      effective_to: body.effective_to || null,
      is_active: body.is_active !== false,
      notes: body.notes ? String(body.notes) : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("product_cost_rules")
      .upsert(payload as any)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      rule: data,
      message: "Product cost rule saved.",
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_costs_rule_save_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (
  path === "/v1/product-costs/import/preview" &&
  req.method === "POST"
) {
  try {
    const body = await readJsonBody(req);

    const parsed = parseCsv(body.csv || "");
    const rows = parsed.rows;

    let newRules = 0;
    let updates = 0;

    const supabase = getSupabase(env);

    for (const row of rows) {
      const { data } = await supabase
        .from("product_cost_rules")
        .select("id")
        .eq("platform", row.platform || "")
        .eq("product_name", row.product_name || "")
        .eq("sku", row.sku || "")
        .limit(1);

      if (data?.length) {
        updates++;
      } else {
        newRules++;
      }
    }

    return json({
      ok: true,
      total_rows: rows.length,
      new_rules: newRules,
      updates,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message || String(e),
      },
      500,
    );
  }
}



if (
  path === "/v1/product-costs/import" &&
  req.method === "POST"
) {
  try {
    const body = await readJsonBody(req);

    const parsed = parseCsv(body.csv || "");
    const rows = parsed.rows;

    const supabase = getSupabase(env);

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const payload = {
        platform: row.platform || null,
        product_name: row.product_name || null,
        sku: row.sku || null,
        product_type: row.product_type || "physical",
        package_quantity: Number(row.package_quantity || 1),
        package_cost: Number(row.package_cost || 0),
        shipping_cost: Number(row.shipping_cost || 0),
        allow_unit_fallback: false,
        currency: "USD",
        is_active: true,
      };

      const { data: existing } = await supabase
        .from("product_cost_rules")
        .select("id")
        .eq("platform", payload.platform)
        .eq("product_name", payload.product_name)
        .eq("sku", payload.sku)
        .limit(1);

      if (existing?.length) {
        await supabase
          .from("product_cost_rules")
          .update(payload)
          .eq("id", existing[0].id);

        updated++;
      } else {
        await supabase
          .from("product_cost_rules")
          .insert(payload);

        inserted++;
      }
    }

    return json({
      ok: true,
      inserted,
      updated,
      total_rows: rows.length,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        message: e?.message || String(e),
      },
      500,
    );
  }
}



if (path === "/v1/product-costs/import-csv" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const preview = Boolean(body.preview);
    const csvText = String(body.csv_text || "").trim();

    if (!csvText) {
      return json({ ok: false, message: "csv_text is required" }, 400);
    }

    const parsed = parseCsv(csvText);
    const errors: any[] = [];
    const rows: any[] = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      const r = parsed.rows[i];
      const rowNum = i + 2;

      const platform = pickField(r, ["platform"]);
      const productName = pickField(r, ["product_name", "product", "name"]);
      const sku = pickField(r, ["sku"]);
      const productType = pickField(r, ["product_type", "type"]) || "physical";
      const packageQuantity = Number(pickField(r, ["package_quantity", "qty", "quantity"]) || 1);
      const packageCost = Number(pickField(r, ["package_cost", "cost", "product_cost"]) || 0);
      const shippingCost = Number(pickField(r, ["shipping_cost", "shipping"]) || 0);
      const currency = pickField(r, ["currency"]) || "USD";

      if (!platform) errors.push({ row: rowNum, message: "Missing platform" });
      if (!productName && !sku) errors.push({ row: rowNum, message: "Missing product_name or sku" });
      if (!Number.isFinite(packageQuantity) || packageQuantity < 1) errors.push({ row: rowNum, message: "Invalid package_quantity" });
      if (!Number.isFinite(packageCost) || packageCost < 0) errors.push({ row: rowNum, message: "Invalid package_cost" });

      rows.push({
        platform,
        product_name: productName || null,
        sku: sku || null,
        product_type: productType,
        package_quantity: Math.max(1, packageQuantity || 1),
        package_cost: Math.max(0, packageCost || 0),
        shipping_cost: Math.max(0, shippingCost || 0),
        allow_unit_fallback: false,
        currency,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }

    if (errors.length) {
      return json({
        ok: false,
        preview,
        rows_found: parsed.rows.length,
        valid_rows: rows.length - errors.length,
        errors,
      }, 400);
    }

    if (preview) {
      return json({
        ok: true,
        preview: true,
        rows_found: parsed.rows.length,
        valid_rows: rows.length,
        sample: rows.slice(0, 10),
      });
    }

    const supabase = getSupabase(env);

    const { error } = await supabase
      .from("product_cost_rules")
      .upsert(rows as any[]);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      imported: rows.length,
      message: `Imported ${rows.length} cost rules.`,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "product_cost_csv_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/product-costs/rules/update" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const id = Number(body.id || 0);

    if (!id) {
      return json({ ok: false, message: "id is required" }, 400);
    }

    const supabase = getSupabase(env);

    const payload = {
      product_type: body.product_type || "physical",
      package_quantity: Math.max(1, Number(body.package_quantity || 1)),
      package_cost: Math.max(0, Number(body.package_cost || 0)),
      shipping_cost: Math.max(0, Number(body.shipping_cost || 0)),
      allow_unit_fallback: Boolean(body.allow_unit_fallback),
      currency: body.currency || "USD",
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("product_cost_rules")
      .update(payload)
      .eq("id", id);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      updated_id: id,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_cost_rule_update_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/merchant-accounts/rebuild" && req.method === "POST") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase.rpc("rebuild_merchant_accounts");

    if (error) throw new Error(error.message);

    return json(data || { ok: true });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "merchant_accounts_rebuild_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}

if (path === "/v1/product-costs/rules/delete" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const id = Number(body.id || 0);

    if (!id) {
      return json({ ok: false, message: "id is required" }, 400);
    }

    const supabase = getSupabase(env);

    const { error } = await supabase
      .from("product_cost_rules")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      deleted_id: id,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: "product_cost_rule_delete_failed",
        message: e?.message || String(e),
      },
      500,
    );
  }
}
  


  if (path === "/v1/integrations/checkoutchamp/settings" && req.method === "GET") {
    const supabase = getSupabase(env);

    await supabase.from("integrations_settings").upsert(
      {
        platform: "checkoutchamp",
        auto_import_enabled: false,
        auto_import_interval_minutes: 60,
        auto_import_lookback_hours: 2,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "platform" }
    );

    const { data, error } = await supabase.from("integrations_settings").select("*").eq("platform", "checkoutchamp").maybeSingle();
    if (error) throw new Error(error.message);

    return json({ ok: true, platform: "checkoutchamp", ...(data || {}) });
  }

  if (path === "/v1/integrations/checkoutchamp/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const supabase = getSupabase(env);

    const patch = {
      platform: "checkoutchamp",
      auto_import_enabled: Boolean(body.auto_import_enabled),
      auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(body.auto_import_interval_minutes ?? 60) || 60)),
      auto_import_lookback_hours: Math.max(1, Math.min(168, Number(body.auto_import_lookback_hours ?? 2) || 2)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("integrations_settings").upsert(patch as any, { onConflict: "platform" });
    if (error) throw new Error(error.message);

    return json({ ok: true, message: "Settings saved." });
  }

  if ((path === "/v1/integrations/checkoutchamp/import-orders" || path === "/v1/integrations/checkoutchamp/run-now") && req.method === "POST") {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const filter = String(body.filter ?? "all_sales").trim();

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const supabase = getSupabase(env);

    if (path.endsWith("/run-now")) {
      await supabase
        .from("integrations_settings")
        .update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("platform", "checkoutchamp");
    }

    try {
      const res = await runCheckoutChampImport(env, { from, to, filter });

      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
          .eq("platform", "checkoutchamp");
      }

      return json({
        ok: true,
        platform: "checkoutchamp",
        from,
        to,
        filter,
        ...res,
        message: `Imported ${res.upserted} orders (fetched ${res.fetched}).`,
      });
    } catch (e: any) {
      if (path.endsWith("/run-now")) {
        await supabase
          .from("integrations_settings")
          .update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() })
          .eq("platform", "checkoutchamp");
      }
      throw e;
    }
  }

  if (path === "/v1/integrations/wowboost/import-status" && req.method === "GET") {
    const jobId = String(url.searchParams.get("job_id") ?? "").trim();

    if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);

    const job = await getImportJob(env, jobId);
    if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);

    return json({ ok: true, job });
  }

  if (path === "/v1/integrations/wowboost/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "wowboost");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "wowboost",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "wowboost",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }
  
  if (path === "/v1/integrations/wowpay/import-one-page" && req.method === "POST") {
	  const body = await readJsonBody(req);
	  const from = String(body.from ?? "").trim();
	  const to = String(body.to ?? "").trim();
	  const page = Math.max(1, Number(body.page ?? 1));
	  const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));
	
	  if (!parseYmd(from) || !parseYmd(to)) {
	    return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
	  }
	
	  const result = await runWowPayImportPage(env, { from, to, page, pageSize });
	  return json({ ok: true, platform: wowSuiteKey("wowpay"), from, to, ...result });
	}

  if (path === "/v1/integrations/wowsuite/status" && req.method === "GET") {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("integrations_credentials")
      .select("platform,base_url,username,created_at,updated_at")
      .in("platform", [wowSuiteKey("wowboost"), wowSuiteKey("wowpay"), "wowboost", "wowpay", "wowsuite"]);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const wowboost = rows.find((r) => [wowSuiteKey("wowboost"), "wowboost", "wowsuite"].includes(String(r.platform))) || null;
    const wowpay = rows.find((r) => String(r.platform) === wowSuiteKey("wowpay") || String(r.platform) === "wowpay") || null;

    return json({
      ok: true,
      platform: "wowsuite",
      connected: Boolean(wowboost || wowpay),
      subs: {
        wowboost: wowboost
          ? {
              connected: true,
              baseUrl: wowboost.base_url ?? null,
              username: wowboost.username ?? null,
              updated_at: wowboost.updated_at ?? null,
            }
          : { connected: false },
        wowpay: wowpay
          ? {
              connected: true,
              baseUrl: wowpay.base_url ?? null,
              username: wowpay.username ?? null,
              updated_at: wowpay.updated_at ?? null,
            }
          : { connected: false },
      },
    });
  }
  
  if (path === "/v1/platform-orders" && req.method === "GET") {
    try {
      const platform = String(url.searchParams.get("platform") || "").trim();
      const status = String(url.searchParams.get("status") || "").trim();
      const from = String(url.searchParams.get("from") || "").trim();
      const to = String(url.searchParams.get("to") || "").trim();
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const search = String(url.searchParams.get("q") || "").trim();

      const sortRaw = String(url.searchParams.get("sort") || "order_ts").trim();
      const dirRaw = String(url.searchParams.get("dir") || "desc").trim().toLowerCase();

      const allowedSorts = new Set([
        "order_ts",
        "gross_amount",
        "status",
        "platform",
        "platform_order_id",
        "transaction_id",
        "customer_email",
        "tkid",
        "currency",
      ]);

      const sort = allowedSorts.has(sortRaw) ? sortRaw : "order_ts";
      const dir = dirRaw === "asc" ? "asc" : "desc";

      const supabase = getSupabase(env);

      let q = supabase
        .from("platform_orders")
        .select("*", { count: "exact" });

      if (platform) q = q.eq("platform", platform);
      if (status && status !== "ALL_SALES") q = q.eq("status", status);
      if (from) q = q.gte("order_ts", `${from}T00:00:00.000Z`);
      if (to) q = q.lte("order_ts", `${to}T23:59:59.999Z`);

      if (search) {
        const safeSearch = search.replace(/[%_]/g, "");

        q = q.or(
          [
            `platform_order_id.ilike.%${safeSearch}%`,
            `transaction_id.ilike.%${safeSearch}%`,
            `customer_email.ilike.%${safeSearch}%`,
            `tkid.ilike.%${safeSearch}%`,
          ].join(",")
        );
      }

      q = q
        .order(sort, { ascending: dir === "asc" })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      return json({
        ok: true,
        orders: data || [],
        count: data?.length || 0,
        total: count || 0,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
        sort,
        dir,
        search,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "platform_orders_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  if (path === "/v1/integrations/wowboost/debug-export" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const supabase = getSupabase(env);

      const { data: creds, error } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
      if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

      const authBase = String(
        (creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE
      ).replace(/\/+$/, "");

      const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);

      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      const exportUrl = new URL(`${exportBase}/order/export/1/10`);
      exportUrl.searchParams.set("StartDate", from);
      exportUrl.searchParams.set("EndDate", to);

      const exportRes = await fetchWithTimeout(exportUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `bearer ${bearer}`,
          Accept: "application/json, text/plain, */*",
        },
      }, 30000);

      const exportText = await readTextSafe(exportRes);
      const exportJson = safeJsonParse(exportText);
      const link = String(exportJson?.link ?? "").trim();

      let csvStatus: number | null = null;
      let csvSnippet: string | null = null;
      let csvHeaders: string[] = [];
      let csvRowCount: number | null = null;

      if (link) {
        const csvRes = await fetchWithTimeout(link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
        csvStatus = csvRes.status;
        const csvText = await readTextSafe(csvRes);
        csvSnippet = csvText.slice(0, 500);

        if (csvRes.ok) {
          const parsed = parseCsv(csvText);
          csvHeaders = parsed.headers;
          csvRowCount = parsed.rows.length;
        }
      }

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        sort,
        dir,
        authBase,
        exportBase,
        exportUrl: exportUrl.toString(),
        exportStatus: exportRes.status,
        exportOk: exportRes.ok,
        exportJson,
        exportSnippet: exportText.slice(0, 500),
        csvLinkFound: Boolean(link),
        csvStatus,
        csvHeaders,
        csvRowCount,
        csvSnippet,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_debug_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/wowboost/import-orders-now" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const res = await runWowSuiteWowBoostImport(env, {
        from,
        to,
        pageSize: Number(body.pageSize ?? 10),
        debug: Boolean(body.debug),
      });

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        ...res,
      });
    } catch (e: any) {
      return json(
        {
          ok: false,
          error: "wowboost_import_now_failed",
          message: e?.message || String(e),
        },
        500
      );
    }
  }
  
  if (path === "/v1/integrations/gateway-classic/import-one-page" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const platform = String(body.platform ?? "").trim();
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const page = Math.max(0, Number(body.page ?? 0));
    const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

    if (!platform) return json({ ok: false, error: "bad_request", message: "platform is required" }, 400);
    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const result = await runGatewayClassicImportPage(env, { platform, from, to, page, pageSize });

    return json({
      ok: true,
      platform,
      connector: "classic_query",
      from,
      to,
      ...result,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_classic_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/gateway-classic/status" && req.method === "GET") {
  try {
    const url = new URL(req.url);
    const platform = String(url.searchParams.get("platform") || "").trim();

    if (!platform) {
      return json({
        ok: false,
        error: "bad_request",
        message: "platform is required",
      }, 400);
    }

    const creds = await getLatestCredential(env, platform);

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform,
      baseUrl: (creds as any).base_url || "",
      username: (creds as any).username || "",
      created_at: (creds as any).created_at || null,
      updated_at: (creds as any).updated_at || null,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_status_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/gateway-classic/list" && req.method === "GET") {
  try {
    const supabase = getSupabase(env);

    const { data, error } = await supabase
      .from("integrations_credentials")
      .select("platform,base_url,username,created_at,updated_at")
      .or("platform.like.nmi:%,platform.eq.paydiverse")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return json({
      ok: true,
      accounts: data || [],
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "gateway_list_failed",
      message: e?.message || String(e),
    }, 500);
  }
}
  
    if (path === "/v1/integrations/wowboost/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const page = Math.max(1, Number(body.page ?? 1));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const supabase = getSupabase(env);

      const { data: creds, error } = await supabase
        .from("integrations_credentials")
        .select("*")
        .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!creds) throw new Error("WowBoost not connected.");

      const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
      const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
      const username = String((creds as any).username ?? "").trim();
      const password = await decryptSecretFromCredRow(env, creds as any);

      const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

      const exp = await wowBoostExportPage({
        exportBase,
        bearer,
        page,
        pageSize,
        fromYmd: from,
        toYmd: to,
      });

      const csvRes = await fetchWithTimeout(exp.link, { method: "GET", headers: { Accept: "text/csv,*/*" } }, 30000);
      const csvText = await readTextSafe(csvRes);

      if (!csvRes.ok) {
        throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
      }

      const parsed = parseCsv(csvText);
      
      console.log("WOWBOOST CSV HEADERS", parsed.headers);
	  console.log("WOWBOOST FIRST ROW", parsed.rows[0]);

      const upserts = await Promise.all(
        parsed.rows.map(async (r) => {
          const orderId =
            pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
            pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

          if (!orderId) return null;

          const status = wowSuiteNormalizeStatus(
            pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
              pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])
          );

          let gross = parseMoneyMaybe(
            pickField(r, [
              "Order Price USD",
              "Order Price",
              "productPrice",
              "Product Price",
              "ProductPrice",
              "Amount USD",
              "Amount",
              "Total",
              "OrderTotal",
            ])
          );

          if (gross == null) gross = 0;
          if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
            gross = -Math.abs(gross);
          }

          const isoTs =
            parseDateToIsoMaybe(
              pickField(r, ["Order Create Date", "Updated Date", "Create Date (Receipts)", "OrderDate", "Date"])
            ) || `${from}T00:00:00.000Z`;

          const emailFields = await emailIdentityFields(
            pickField(r, ["CustomerEmail", "Customer Email", "Email", "email", "customerEmail"])
          );
          const transactionId =
            pickField(r, ["PaymentTrackingNumber", "Payment Tracking Number", "TransactionId", "Transaction ID", "transaction_id", "ReferenceId", "Reference ID"]) || null;
          const efTid = pickEverflowTid(r) || null;
          const phone = normalizePhone(pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"]));

          return {
            platform: "wowboost",
            platform_order_id: `wowboost:${orderId}`,
            platform_store_id: pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
            order_id: String(orderId),
            order_ts: isoTs,
            status,
            status_norm: status,
            gross_amount: gross,
            receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount", "AmountUSD", "amount"])) ?? null,
            currency: pickField(r, ["Currency Code", "Currency", "currencyCode", "Transaction Currency"]) || "USD",

            ...emailFields,
            email: emailFields.customer_email,
            phone: phone || null,
            transaction_id: transactionId,
            everflow_transaction_id: efTid,
            tkid: pickTrackingId(r) || null,
            affiliate_id: pickField(r, ["Affiliate ID", "AffiliateId", "affiliate_id", "Partner ID", "PartnerId"]) || null,
            everflow_offer_id: pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,
            source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
            sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
            sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
            sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
            sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
            sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,
            product_subtotal: parseMoneyMaybe(
              pickField(r, [
                "Order Price USD",
                "Order Price",
                "productPrice",
                "Product Price",
                "ProductPrice",
                "Product Subtotal",
                "Subtotal",
              ])
            ) ?? null,
            shipping_amount: parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,
            tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
            product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
            shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
            gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
            chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,
            tracking_number: pickField(r, ["ShipmentTrackingNumber", "Shipment Tracking Number", "FulfillmentTrackingNumber", "Tracking Number"]) || null,
            shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
            raw_json: r,
          };
        })
      ).then((rows) => rows.filter(Boolean));

      const deduped = dedupePlatformOrders(upserts);

      if (deduped.length) {
        const { error: upErr } = await supabase
          .from("platform_orders")
          .upsert(deduped as any[], { onConflict: "platform_order_id" });

        if (upErr) throw new Error(upErr.message);
      }

      return json({
        ok: true,
        platform: "wowsuite:wowboost",
        from,
        to,
        page,
        pageSize,
        fetched: parsed.rows.length,
        upserted: deduped.length,
        hasMore: exp.hasMore,
        nextPage: exp.hasMore ? page + 1 : null,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "wowboost_import_one_page_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/wowboost/import-next-page" && req.method === "POST") {
  return json(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "import-next-page is deprecated. Use import-orders-async and queue status polling.",
    },
    410
  );
}
  
    if (path === "/v1/integrations/nmi/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const offset = Math.max(0, Number(body.offset ?? 0));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const result = await runNmiImportPage(env, { from, to, offset, pageSize });

      return json({
        ok: true,
        platform: "nmi:lifeheater14090",
        from,
        to,
        ...result,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "nmi_import_one_page_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }
  
    if (path === "/v1/integrations/nmi/status" && req.method === "GET") {
    const creds = await getLatestCredential(env, "nmi:lifeheater14090");

    if (!creds) {
      return json({
        ok: true,
        connected: false,
        platform: "nmi:lifeheater14090",
        baseUrl: null,
        username: null,
        created_at: null,
        updated_at: null,
      });
    }

    return json({
      ok: true,
      connected: true,
      platform: "nmi:lifeheater14090",
      baseUrl: creds.base_url ?? null,
      username: creds.username ?? null,
      created_at: creds.created_at ?? null,
      updated_at: creds.updated_at ?? null,
    });
  }
  
  if (path === "/v1/integrations/nmi-lifeheater14090/import-one-page-classic" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();
    const page = Math.max(0, Number(body.page ?? 0));
    const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

    if (!parseYmd(from) || !parseYmd(to)) {
      return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
    }

    const result = await runNmiClassicImportPage(env, { from, to, page, pageSize });

    return json({
      ok: true,
      platform: "nmi:lifeheater14090",
      connector: "classic_query",
      from,
      to,
      ...result,
    });
  } catch (e: any) {
    return json({
      ok: false,
      error: "nmi_classic_import_failed",
      message: e?.message || String(e),
    }, 500);
  }
}

if (path === "/v1/integrations/nmi-lifeheater14090/debug-classic" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim();

    const creds = await getLatestCredential(env, "nmi:lifeheater14090");
    if (!creds) throw new Error("NMI LifeHeater14090 not connected.");

    const securityKey = await decryptSecretFromCredRow(env, creds as any);
    const baseUrl = String((creds as any).base_url || "https://secure.networkmerchants.com").replace(/\/+$/, "");

    const form = new URLSearchParams();
    form.set("security_key", securityKey.trim());
    form.set("start_date", nmiClassicDate(from, false));
    form.set("end_date", nmiClassicDate(to, true));
    form.set("result_limit", "10");
    form.set("page_number", "0");
    form.set("result_order", "standard");
    form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

    const res = await fetch(`${baseUrl}/api/query.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const xml = await readTextSafe(res);

    return json({
      ok: true,
      status: res.status,
      baseUrl,
      submittedStartDate: nmiClassicDate(from, false),
      submittedEndDate: nmiClassicDate(to, true),
      transactionCount: xmlBlocks(xml, "transaction").length,
      responseSnippet: xml.slice(0, 3000),
      debugVersion: "nmi-classic-v3",
    });
  } catch (e: any) {
    return json({ ok: false, error: "nmi_debug_failed", message: e?.message || String(e) }, 500);
  }
}


  if (path === "/v1/integrations/paydiverse/debug-classic" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();

      const creds = await getLatestCredential(env, "paydiverse");
      if (!creds) throw new Error("PayDiverse not connected.");

      const securityKey = await decryptSecretFromCredRow(env, creds as any);
      const baseUrl = String((creds as any).base_url || "https://paydiverse.transactiongateway.com").replace(/\/+$/, "");

      const form = new URLSearchParams();
      form.set("security_key", securityKey.trim());
      form.set("start_date", nmiClassicDate(from, false));
      form.set("end_date", nmiClassicDate(to, true));
      form.set("result_limit", "10");
      form.set("page_number", "0");
      form.set("result_order", "standard");
      form.set("condition", "pending,pendingsettlement,in_progress,abandoned,failed,canceled,complete,unknown");

      const res = await fetch(`${baseUrl}/api/query.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const xml = await readTextSafe(res);

      return json({
        ok: true,
        platform: "paydiverse",
        status: res.status,
        baseUrl,
        submittedStartDate: nmiClassicDate(from, false),
        submittedEndDate: nmiClassicDate(to, true),
        transactionCount: xmlBlocks(xml, "transaction").length,
        responseSnippet: xml.slice(0, 3000),
        debugVersion: "paydiverse-classic-v1",
      });
    } catch (e: any) {
      return json({ ok: false, error: "paydiverse_debug_failed", message: e?.message || String(e) }, 500);
    }
  }

  if (path === "/v1/integrations/paydiverse/import-one-page" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const from = String(body.from ?? "").trim();
      const to = String(body.to ?? "").trim();
      const page = Math.max(0, Number(body.page ?? 0));
      const pageSize = Math.max(1, Math.min(1000, Number(body.pageSize ?? 1000)));

      if (!parseYmd(from) || !parseYmd(to)) {
        return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
      }

      const result = await runPayDiverseClassicImportPage(env, { from, to, page, pageSize });

      return json({
        ok: true,
        platform: "paydiverse",
        connector: "classic_query",
        from,
        to,
        ...result,
      });
    } catch (e: any) {
      return json({
        ok: false,
        error: "paydiverse_classic_import_failed",
        message: e?.message || String(e),
      }, 500);
    }
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function runWowBoostImportPage(
  env: Env,
  args: { from: string; to: string; page: number; pageSize?: number }
) {
  const supabase = getSupabase(env);
  const pageSize = Math.max(1, Math.min(100, Number(args.pageSize ?? 100)));

  const fromMs = Date.parse(`${args.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${args.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toMs = toExclusive.getTime();

  const { data: creds, error } = await supabase
    .from("integrations_credentials")
    .select("*")
    .in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!creds) throw new Error("WowBoost not connected.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);

  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });

  const exp = await wowBoostExportPage({
    exportBase,
    bearer,
    page: args.page,
    pageSize,
    fromYmd: args.from,
    toYmd: args.to,
  });

  const csvRes = await fetchWithTimeout(
    exp.link,
    { method: "GET", headers: { Accept: "text/csv,*/*" } },
    30000
  );

  const csvText = await readTextSafe(csvRes);

  if (!csvRes.ok) {
    throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
  }

  const parsed = parseCsv(csvText);

  const mapped = await Promise.all(
    parsed.rows.map(async (r) => {
      const orderId =
        pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
        pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

      if (!orderId) return null;

      const rawDate = pickField(r, [
        "Order Create Date",
        "Updated Date",
        "Create Date (Receipts)",
        "OrderDate",
        "Date",
      ]);

      const isoTs = parseDateToIsoMaybe(rawDate);
      if (!isoTs) return null;

      const orderMs = Date.parse(isoTs);
      if (!Number.isFinite(orderMs)) return null;

      if (orderMs < fromMs || orderMs >= toMs) return null;

      const status = wowSuiteNormalizeStatus(
        pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
          pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])
      );

      let gross = parseMoneyMaybe(
        pickField(r, [
          "Order Price USD",
          "Order Price",
          "productPrice",
          "Product Price",
          "Amount USD",
          "Amount",
          "Total",
          "OrderTotal",
        ])
      );

      if (gross == null) gross = 0;

      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
        gross = -Math.abs(gross);
      }

      const emailFields = await emailIdentityFields(pickField(r, ["Email", "email"]));

      const transactionId =
        pickField(r, [
          "PaymentTrackingNumber",
          "Payment Tracking Number",
          "TransactionId",
          "Transaction ID",
          "transaction_id",
          "ReferenceId",
          "Reference ID",
        ]) || null;

      const efTid =
        pickField(r, [
          "_ef_transaction_id",
          "ef_transaction_id",
          "everflow_transaction_id",
          "sub5",
          "Sub5",
          "SUB5",
          "s5",
          "S5",
        ]) || null;

      const phone = normalizePhone(
        pickField(r, ["CustomerPhone", "Customer Phone", "Phone", "phone", "Phone Number"])
      );

      return {
        platform: "wowboost",
        platform_order_id: `wowboost:${orderId}`,
        platform_store_id:
          pickField(r, ["Campaign ID", "CampaignId", "Campaign", "Brand Campaign"]) || null,
        order_id: String(orderId),
        order_ts: isoTs,
        status,
        status_norm: status,
        gross_amount: gross,

        receipt_total: parseMoneyMaybe(pickField(r, ["Amount USD", "Amount"])) ?? null,

        currency:
          pickField(r, [
            "Currency Code",
            "Currency",
            "currencyCode",
            "Transaction Currency",
          ]) || "USD",

        ...emailFields,
        email: emailFields.customer_email,
        phone: phone || null,
        transaction_id: transactionId,
        everflow_transaction_id: efTid,
        tkid: pickTrackingId(r) || null,

        affiliate_id:
          pickField(r, [
            "Affiliate ID",
            "AffiliateId",
            "affiliate_id",
            "Partner ID",
            "PartnerId",
          ]) || null,

        everflow_offer_id:
          pickField(r, ["Offer ID", "OfferId", "Campaign ID", "CampaignId"]) || null,

        source_id: pickField(r, ["Source ID", "SourceId", "source_id"]) || null,
        sub1: pickField(r, ["S1", "s1", "sub1", "Sub1"]) || null,
        sub2: pickField(r, ["S2", "s2", "sub2", "Sub2"]) || null,
        sub3: pickField(r, ["S3", "s3", "sub3", "Sub3"]) || null,
        sub4: pickField(r, ["S4", "s4", "sub4", "Sub4"]) || null,
        sub5: pickField(r, ["S5", "s5", "sub5", "Sub5"]) || null,

        product_subtotal:
          parseMoneyMaybe(
            pickField(r, ["Order Price USD", "Order Price", "productPrice", "Product Price"])
          ) ?? null,

        shipping_amount:
          parseMoneyMaybe(pickField(r, ["Shipping Amount", "Shipping", "Shipping Price"])) ?? null,

        tax_amount: parseMoneyMaybe(pickField(r, ["Tax Amount", "Tax"])) ?? null,
        product_cost: parseMoneyMaybe(pickField(r, ["Product Cost", "COGS"])) ?? null,
        shipping_cost: parseMoneyMaybe(pickField(r, ["Shipping Cost"])) ?? null,
        gateway_fee: parseMoneyMaybe(pickField(r, ["Gateway Fee", "Processor Fee"])) ?? null,
        chargeback_fee: parseMoneyMaybe(pickField(r, ["Chargeback Fee"])) ?? null,

        tracking_number:
          pickField(r, [
            "ShipmentTrackingNumber",
            "Shipment Tracking Number",
            "FulfillmentTrackingNumber",
            "Tracking Number",
          ]) || null,

        shipping_carrier: pickField(r, ["Shipping Carrier", "Carrier"]) || null,
        raw_json: r,
      };
    })
  );

  const validRows = mapped.filter(Boolean);
  const deduped = dedupePlatformOrders(validRows);

  if (deduped.length) {
    const { error: upErr } = await supabase
      .from("platform_orders")
      .upsert(deduped as any[], { onConflict: "platform_order_id" });

    if (upErr) throw new Error(upErr.message);
  }

  const sourceRows = parsed.rows.length;
  const validInRangeRows = validRows.length;

  const hasMore =
    sourceRows >= pageSize &&
    validInRangeRows > 0 &&
    Boolean(exp.hasMore);

  return {
    fetched: validInRangeRows,
    sourceRows,
    upserted: deduped.length,
    page: args.page,
    pageSize,
    hasMore,
    nextPage: hasMore ? args.page + 1 : null,
  };
}

  export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/v1/integrations/wowboost/import-orders-async" && req.method === "POST") {
        const body = await readJsonBody(req);
        const from = String(body.from ?? "").trim();
        const to = String(body.to ?? "").trim();
        const filter = String(body.filter ?? "all_sales").trim();

        if (!parseYmd(from) || !parseYmd(to)) {
          return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
        }

        if (!env.wowboost_imports) {
          return json({
            ok: false,
            error: "queue_not_configured",
            message: "wowboost_imports queue binding is missing. Check wrangler.toml.",
          }, 500);
        }

        const job = await createImportJob(env, {
          platform: wowSuiteKey("wowboost"),
          module: "wowboost",
          from,
          to,
          filter,
        });
  
  const pageSize = Math.max(1, Math.min(100, Number(body.pageSize ?? 100)));

  await updateImportJob(env, job.id, {
    status: "queued",
    pages: 0,
    fetched: 0,
    upserted: 0,
    retries: 0,
    error: null,
    started_at: new Date().toISOString(),
  });

  await env.wowboost_imports.send({
    job_id: job.id,
    from,
    to,
    filter,
    page: 1,
    pageSize,
    attempt: 1,
  });

  const updated = await getImportJob(env, job.id);

  return json({
    ok: true,
    job_id: job.id,
    job: updated,
    status: updated?.status ?? "queued",
    platform: wowSuiteKey("wowboost"),
    module: "wowboost",
    from,
    to,
    filter,
    pageSize,
    message: "Import job queued. Background worker will process pages.",
  });
}

if (path === "/v1/integrations/wowboost/import-job-status" && req.method === "GET") {
  const jobId = url.searchParams.get("job_id") || "";

  if (!jobId) {
    return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);
  }

  const job = await getImportJob(env, jobId);

  if (!job) {
    return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);
  }

  return json({
    ok: true,
    job,
    done: job.status === "completed" || job.status === "failed" || job.status === "cancelled",
  });
}


      return await router(req, env);
    } catch (e: any) {
      console.error("[TraceKit] unhandled error", e);
      return json({ ok: false, error: "server_error", message: e?.message || "unknown" }, e?.status || 500);
    }
  },
  
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
  for (const msg of batch.messages) {
    const body = msg.body || {};

    const jobId = String(body.job_id ?? body.jobId ?? "").trim();
    const page = Math.max(1, Number(body.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(body.pageSize ?? 100)));
    const attempt = Math.max(1, Number(body.attempt ?? 1));
    const maxAttempts = 10;

    if (!jobId) {
      msg.ack();
      continue;
    }

    try {
      const job = await getImportJob(env, jobId);

      if (!job) {
        msg.ack();
        continue;
      }

      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        msg.ack();
        continue;
      }

      await updateImportJob(env, jobId, {
        status: "running",
        started_at: job.started_at || new Date().toISOString(),
        completed_at: null,
        error: null,
      });

      const result = await runWowBoostImportPage(env, {
        from: job.from_date,
        to: job.to_date,
        page,
        pageSize,
      });

      const fetchedThisPage = Number(result.fetched ?? 0);
      const upsertedThisPage = Number(result.upserted ?? 0);

      const nextFetched = Number(job.fetched ?? 0) + fetchedThisPage;
      const nextUpserted = Number(job.upserted ?? 0) + upsertedThisPage;

      const hasMore = Boolean(result.hasMore);

      await updateImportJob(env, jobId, {
        status: hasMore ? "running" : "completed",
        pages: Math.max(Number(job.pages ?? 0), page),
        fetched: nextFetched,
        upserted: nextUpserted,
        retries: 0,
        last_success_page: page,
        last_success_at: new Date().toISOString(),
        last_error_at: null,
        completed_at: hasMore ? null : new Date().toISOString(),
        error: null,
      });

      if (hasMore) {
        await env.wowboost_imports.send({
          job_id: jobId,
          page: page + 1,
          pageSize,
          attempt: 1,
        });
      }

      msg.ack();
    } catch (e: any) {
      const message = e?.message || String(e) || "unknown";

      console.error("[TraceKit] wowboost queue import page failed", {
        jobId,
        page,
        pageSize,
        attempt,
        message,
      });

      if (attempt >= maxAttempts) {
        await updateImportJob(env, jobId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: `Page ${page} failed after ${attempt} attempts: ${message}`,
          retries: 0,
          last_error_at: new Date().toISOString(),
        }).catch(() => {});

        msg.ack();
        continue;
      }

      await updateImportJob(env, jobId, {
        status: "retrying",
        completed_at: null,
        error: `Page ${page} attempt ${attempt} failed: ${message}`,
        last_error_at: new Date().toISOString(),
      }).catch(() => {});

      await env.wowboost_imports.send({
        job_id: jobId,
        page,
        pageSize,
        attempt: attempt + 1,
      });

      msg.ack();
    }
  }
},

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCheckoutChampImport(env));
  },
};
