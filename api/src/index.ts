// src/index.ts
// TraceKit API Worker (Cloudflare Workers + Supabase)
// Integrations: CheckoutChamp/Konnektive + WOWSuite (WowBoost + WowPay umbrella)

import { createClient } from "@supabase/supabase-js";

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
      ? ["checkoutchamp", "konnektive", "konnective"]
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

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
  });

  const text = await readTextSafe(res);
  if (!res.ok) throw new Error(`CheckoutChamp order query failed (${res.status}): ${text.slice(0, 300)}`);

  const js = safeJsonParse(text);
  if (!js) throw new Error(`CheckoutChamp order query returned invalid JSON: ${text.slice(0, 300)}`);

  return js;
}

function normalizeCheckoutChampOrder(order: any) {
  const id = pickField(order, ["orderId", "order_id", "orderID", "id", "orderNumber", "order_number"]);
  if (!id) return null;

  const statusRaw = pickField(order, ["orderStatus", "status", "order_status", "paymentStatus", "transactionStatus"]);
  const status = normalizeOrderStatus(statusRaw);

  const ts =
    parseDateToIsoMaybe(pickField(order, ["dateCreated", "createdAt", "createDate", "orderDate", "date", "lastUpdated", "updatedAt"])) ||
    new Date().toISOString();

  let gross = parseMoneyMaybe(pickField(order, ["totalAmount", "orderTotal", "total", "amount", "price", "gross", "revenue"]));
  if (gross == null) gross = 0;
  if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) gross = -Math.abs(gross);

  return {
    platform: "checkoutchamp",
    platform_order_id: `checkoutchamp:${id}`,
    order_ts: ts,
    status,
    gross_amount: gross,
    currency: pickField(order, ["currency", "currencyCode"]) || "USD",
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

    const rows = dedupePlatformOrders(rawRows.map(normalizeCheckoutChampOrder).filter(Boolean));

    if (rows.length) {
      const { error } = await supabase.from("platform_orders").upsert(rows as any[], { onConflict: "platform_order_id" });
      if (error) throw new Error(`CheckoutChamp DB upsert failed: ${error.message}`);
      totalUpserted += rows.length;
    }

    const totalResults = Number(js.totalResults ?? js.total_results ?? js.total ?? 0);
    if (!rawRows.length || rawRows.length < pageSize || (totalResults && page * pageSize >= totalResults)) break;

    page += 1;
  }

  return { fetched: totalFetched, upserted: totalUpserted, pages: page };
}

type WowBoostExportResp = { link?: string; hasMoreToExport?: boolean; nextExport?: string };

async function wowBoostExportPage(args: { exportBase: string; bearer: string; page: number; pageSize: number; fromYmd: string; toYmd: string }) {
  const url = new URL(`${args.exportBase.replace(/\/+$/, "")}/order/export/${args.page}/${args.pageSize}`);
  url.searchParams.set("StartDate", args.fromYmd);
  url.searchParams.set("EndDate", args.toYmd);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `bearer ${args.bearer}`,
      Accept: "application/json, text/plain, */*",
    },
  });

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

    const csvRes = await fetch(exp.link, { method: "GET" });
    const csvText = await readTextSafe(csvRes);
    if (!csvRes.ok) throw new Error(`WowBoost CSV download failed (${csvRes.status}): ${csvText.slice(0, 160)}`);

    const parsed = parseCsv(csvText);
    totalFetched += parsed.rows.length;

    const upserts = parsed.rows
      .map((r) => {
        const orderId =
          pickField(r, ["OrderId", "OrderID", "order_id", "orderid", "Id", "ID"]) ||
          pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

        if (!orderId) return null;

        const status = wowSuiteNormalizeStatus(
          pickField(r, ["OrderStatus", "orderStatus", "Status", "status"]) ||
            pickField(r, ["PaymentStatus", "paymentStatus", "ReceiptStatus", "receiptStatus"])
        );

        const isoTs =
          parseDateToIsoMaybe(
            pickField(r, ["createDate", "CreateDate", "orderDate", "OrderDate", "Date", "CreatedAt", "Created", "lastUpdateDate", "LastUpdateDate"])
          ) || `${args.from}T00:00:00.000Z`;

        let gross = parseMoneyMaybe(
          pickField(r, ["Total", "Amount", "OrderTotal", "Gross", "Revenue", "productPrice", "ProductPrice", "amount", "AmountUSD"])
        );

        if (gross == null) gross = 0;
        if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) gross = -Math.abs(gross);

        return {
          platform: wowSuiteKey("wowboost"),
          platform_order_id: `${wowSuiteKey("wowboost")}:${orderId}`,
          order_ts: isoTs,
          status: status || "UNKNOWN",
          gross_amount: gross,
          currency: pickField(r, ["currencyCode", "CurrencyCode", "Currency", "currency"]) || "USD",
        };
      })
      .filter(Boolean);

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
  const username = String(body.username || "").trim();
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
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!platform || !baseUrl || !username || !password) {
    return json({ ok: false, message: "platform, baseUrl, username, and password are required." }, 400);
  }

  await saveCredential(env, { platform, baseUrl, username, password });

  return json({ ok: true, platform, message: "Credentials saved." });
}

async function router(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return corsPreflight();

  if (path === "/__ping" && req.method === "GET") {
    return json({ ok: true, path, now: new Date().toISOString() });
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

      const exportRes = await fetch(exportUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `bearer ${bearer}`,
          Accept: "application/json, text/plain, */*",
        },
      });

      const exportText = await readTextSafe(exportRes);
      const exportJson = safeJsonParse(exportText);
      const link = String(exportJson?.link ?? "").trim();

      let csvStatus: number | null = null;
      let csvSnippet: string | null = null;
      let csvHeaders: string[] = [];
      let csvRowCount: number | null = null;

      if (link) {
        const csvRes = await fetch(link, { method: "GET" });
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

      const csvRes = await fetch(exp.link);
      const csvText = await readTextSafe(csvRes);

      if (!csvRes.ok) {
        throw new Error(`CSV download failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
      }

      const parsed = parseCsv(csvText);

      const upserts = parsed.rows
        .map((r) => {
          const orderId =
            pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||
            pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);

          if (!orderId) return null;

          const status = wowSuiteNormalizeStatus(
            pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||
              pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])
          );

          let gross = parseMoneyMaybe(
            pickField(r, ["Amount USD", "Amount", "Order Price USD", "Order Price", "Total", "OrderTotal"])
          );

          if (gross == null) gross = 0;
          if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {
            gross = -Math.abs(gross);
          }

          const isoTs =
            parseDateToIsoMaybe(
              pickField(r, ["Order Create Date", "Updated Date", "Create Date (Receipts)", "OrderDate", "Date"])
            ) || `${from}T00:00:00.000Z`;

          return {
            platform: wowSuiteKey("wowboost"),
            platform_order_id: `${wowSuiteKey("wowboost")}:${orderId}`,
            order_ts: isoTs,
            status,
            gross_amount: gross,
            currency: pickField(r, ["Currency Code", "Currency", "currencyCode"]) || "USD",
          };
        })
        .filter(Boolean);

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
  
  return json({ ok: false, error: "not_found" }, 404);
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

        const job = await createImportJob(env, {
          platform: wowSuiteKey("wowboost"),
          module: "wowboost",
          from,
          to,
          filter,
        });

        ctx.waitUntil(
          runWowBoostImportJob(env, { jobId: job.id, from, to, filter, pageSize: 1000 }).catch((e) =>
            console.error("[TraceKit] wowboost async import failed", e)
          )
        );

        return json({
          ok: true,
          job_id: job.id,
          status: job.status,
          platform: wowSuiteKey("wowboost"),
          module: "wowboost",
          from,
          to,
          filter,
          message: "Import job queued.",
        });
      }

      return await router(req, env);
    } catch (e: any) {
      console.error("[TraceKit] unhandled error", e);
      return json({ ok: false, error: "server_error", message: e?.message || "unknown" }, e?.status || 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCheckoutChampImport(env));
  },
};
