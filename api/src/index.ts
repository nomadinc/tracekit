// src/index.ts
// TraceKit API Worker (Cloudflare Workers + Supabase)
// Integrations: CheckoutChamp + WOWSuite (WowBoost + WowPay umbrella)

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

function parseYmd(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function addDaysUTC(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

function isoYmdUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtCcMdYy(d: Date) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function daysInRangeUTC(fromDt: Date, toDt: Date) {
  const out: string[] = [];
  let cur = new Date(Date.UTC(fromDt.getUTCFullYear(), fromDt.getUTCMonth(), fromDt.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(toDt.getUTCFullYear(), toDt.getUTCMonth(), toDt.getUTCDate(), 0, 0, 0, 0));
  while (cur.getTime() <= end.getTime()) {
    out.push(isoYmdUTC(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
}

function normStatusUpper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function parseMoneyMaybe(v: string) {
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

function requireTkSecret(req: Request, env: Env) {
  const expected = String(env.TK_SECRET_KEY ?? "").trim();
  if (!expected) throw new Error("Missing TK_SECRET_KEY");
  const got =
    req.headers.get("x-tk-secret") ||
    req.headers.get("X-TK-Secret") ||
    (req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
      ? req.headers.get("authorization")?.slice(7)
      : null) ||
    "";
  if (String(got ?? "").trim() !== expected) {
    const e: any = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
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
  if (s === "wowsuite") return "wowsuite";
  return s;
}

function b64BasicFromUserPass(username: string, password: string) {
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
}

function wowSuiteParseToken(text: string) {
  const t = String(text ?? "").trim();
  if (t.length > 40 && t.includes(".") && !t.startsWith("{") && !t.startsWith("[")) return t;
  const js = safeJsonParse(t);
  const token = js?.token || js?.access_token || js?.accessToken || js?.data?.token || js?.data?.access_token || js?.data?.accessToken || null;
  return token ? String(token) : null;
}

async function wowSuiteGetBearerToken(args: { authBase: string; username: string; password: string }) {
  const authUrl = `${args.authBase.replace(/\/+$/, "")}/auth`;
  const res = await fetch(authUrl, {
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

type WowBoostExportResp = { link?: string; hasMoreToExport?: boolean; nextExport?: string };

async function wowBoostExportPage(args: { exportBase: string; bearer: string; page: number; pageSize: number; fromYmd: string; toYmd: string }) {
  const base = args.exportBase.replace(/\/+$/, "");
  const url = new URL(`${base}/order/export/${args.page}/${args.pageSize}`);
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
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(cur); cur = ""; continue; }
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

function pickField(row: Record<string, string>, candidates: string[]) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().trim() === c.toLowerCase().trim());
    if (hit) return String(row[hit] ?? "").trim();
  }
  return "";
}

function parseDateToIsoMaybe(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.includes("T")) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(s);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const m2 = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m2) {
    const d = new Date(`${m2[1]}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return "";
}

function wowSuiteNormalizeStatus(raw: string) {
  const s = normStatusUpper(raw);
  if (!s) return "UNKNOWN";
  if (s.includes("REFUND") || s === "REFUNDED" || s === "MANUALLYREFUNDED" || s.includes("PARTIALLYREFUND")) return "REFUNDED";
  if (s.includes("CHARGEBACK") || s.includes("CHARGEDBACK") || s.includes("DISPUTE")) return "CHARGEBACK";
  if (s.includes("CANCEL") || s.includes("VOID") || s.includes("ABANDON")) return "CANCELLED";
  if (s.includes("DECLIN") || s.includes("REJECT") || s.includes("INVALID") || s.includes("ERROR") || s.includes("FAILED")) return "DECLINED";
  if (s.includes("PENDING") || s.includes("PROCESS") || s.includes("HOLD") || s.includes("REVIEW")) return "PENDING";
  if (s.includes("PAID") || s.includes("SHIPP") || s.includes("DELIVER") || s.includes("NEW")) return "COMPLETED";
  return "UNKNOWN";
}

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
    const prevTs = String(prev.order_ts ?? "");
    const nextTs = String(r.order_ts ?? "");
    const prevHasRealTs = prevTs && !prevTs.endsWith("T00:00:00.000Z");
    const nextHasRealTs = nextTs && !nextTs.endsWith("T00:00:00.000Z");
    const prevStatus = String(prev.status ?? "");
    const nextStatus = String(r.status ?? "");
    const prevGoodStatus = prevStatus && prevStatus !== "UNKNOWN";
    const nextGoodStatus = nextStatus && nextStatus !== "UNKNOWN";

    let keep = prev;
    if (!prevGoodStatus && nextGoodStatus) keep = r;
    else if (!prevHasRealTs && nextHasRealTs) keep = r;
    else if (Number(r.gross_amount ?? 0) !== 0 && Number(prev.gross_amount ?? 0) === 0) keep = r;
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
  const { error } = await supabase.from("integration_import_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw new Error(`Failed to update import job: ${error.message}`);
}

async function getImportJob(env: Env, jobId: string) {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from("integration_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(`Failed to read import job: ${error.message}`);
  return (data ?? null) as ImportJobRow | null;
}

async function runWowSuiteWowBoostImport(env: Env, args: { from: string; to: string; pageSize?: number; debug?: boolean }) {
  const supabase = getSupabase(env);
  const { data: creds, error } = await supabase.from("integrations_credentials").select("*").in("platform", [wowSuiteKey("wowboost"), "wowboost", "wowsuite"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`WOWSuite(wowboost) creds read failed: ${error.message}`);
  if (!creds) throw new Error("WowBoost not connected. Save credentials first.");

  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\/+$/, "");
  const exportBase = String(env.DEFAULT_WOWSUITE_EXPORT_BASE || DEFAULT_WOWSUITE_EXPORT_BASE).replace(/\/+$/, "");
  const username = String((creds as any).username ?? "").trim();
  const password = await decryptSecretFromCredRow(env, creds as any);

  const fromDt = parseYmd(args.from);
  const toDt = parseYmd(args.to);
  if (!fromDt || !toDt) throw new Error("from/to must be YYYY-MM-DD");

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
    const rows = parsed.rows;
    totalFetched += rows.length;
    const upserts: any[] = [];

    for (const r of rows) {
      const orderId = pickField(r, ["OrderId", "OrderID", "order_id", "orderid", "Id", "ID"]) || pickField(r, ["Order Number", "OrderNumber", "orderNumber"]) || "";
      if (!orderId) continue;

      const statusRaw = pickField(r, ["OrderStatus", "orderStatus", "Status", "status"]) || pickField(r, ["PaymentStatus", "paymentStatus", "ReceiptStatus", "receiptStatus"]) || "";
      const status = wowSuiteNormalizeStatus(statusRaw);
      const tsRaw = pickField(r, ["createDate", "CreateDate", "orderDate", "OrderDate", "Date", "CreatedAt", "Created", "lastUpdateDate", "LastUpdateDate"]) || "";
      const isoTs = parseDateToIsoMaybe(tsRaw) || `${args.from}T00:00:00.000Z`;
      const amtRaw = pickField(r, ["Total", "Amount", "OrderTotal", "Gross", "Revenue", "productPrice", "ProductPrice", "amount", "AmountUSD"]) || "";

      let gross = parseMoneyMaybe(amtRaw);
      if (gross == null) gross = 0;
      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) gross = -Math.abs(gross);

      const currency = pickField(r, ["currencyCode", "CurrencyCode", "Currency", "currency"]) || "USD";
      upserts.push({ platform: wowSuiteKey("wowboost"), platform_order_id: `${wowSuiteKey("wowboost")}:${orderId}`, order_ts: isoTs, status: status || "UNKNOWN", gross_amount: gross, currency });
    }

    const deduped = dedupePlatformOrders(upserts);
    if (deduped.length) {
      const { error: upErr } = await supabase.from("platform_orders").upsert(deduped, { onConflict: "platform_order_id" });
      if (upErr) throw new Error(`WowBoost DB upsert failed: ${upErr.message}`);
      totalUpserted += deduped.length;
    }

    if (!exp.hasMore || rows.length === 0 || rows.length < pageSize) break;
    page += 1;
  }

  return { fetched: totalFetched, upserted: totalUpserted, pages: page };
}

async function runWowBoostImportJob(env: Env, args: { jobId: string; from: string; to: string; filter?: string | null; pageSize?: number; debug?: boolean }) {
  await updateImportJob(env, args.jobId, { status: "running", started_at: new Date().toISOString(), error: null });
  try {
    const res = await runWowSuiteWowBoostImport(env, { from: args.from, to: args.to, pageSize: args.pageSize, debug: args.debug });
    await updateImportJob(env, args.jobId, { status: "completed", completed_at: new Date().toISOString(), fetched: Number(res.fetched ?? 0), upserted: Number(res.upserted ?? 0), pages: Number(res.pages ?? 0), error: null });
  } catch (e: any) {
    await updateImportJob(env, args.jobId, { status: "failed", completed_at: new Date().toISOString(), error: String(e?.message || e || "unknown") });
    throw e;
  }
}

async function runScheduledCheckoutChampImport(env: Env) {
  const supabase = getSupabase(env);
  await supabase.from("integrations_settings").upsert({ platform: "checkoutchamp", auto_import_enabled: false, auto_import_interval_minutes: 60, updated_at: new Date().toISOString() } as any, { onConflict: "platform" });
  const { data: s, error } = await supabase.from("integrations_settings").select("*").eq("platform", "checkoutchamp").maybeSingle();
  if (error) { console.error("[cron] settings read failed", error); return; }
  if (!s || !(s as any).auto_import_enabled) return;

  const now = new Date();
  const fromDt = addDaysUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)), -2);
  const toDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const from = isoYmdUTC(fromDt);
  const to = isoYmdUTC(toDt);

  await supabase.from("integrations_settings").update({ last_run_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("platform", "checkoutchamp");
  try {
    const res = await runCheckoutChampImport(env, { from, to, filter: "all_sales" } as RunImportArgs);
    await supabase.from("integrations_settings").update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("platform", "checkoutchamp");
    console.log("[cron] checkoutchamp import ok", { from, to, ...res });
  } catch (e: any) {
    await supabase.from("integrations_settings").update({ last_error: String(e?.message || e), updated_at: new Date().toISOString() }).eq("platform", "checkoutchamp");
    console.error("[cron] checkoutchamp import failed", e);
  }
}

async function router(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return corsPreflight();
  if (path === "/__ping" && req.method === "GET") return json({ ok: true, path, now: new Date().toISOString() });

  if (path === "/v1/integrations/wowboost/import-status" && req.method === "GET") {
    try {
      const jobId = String(url.searchParams.get("job_id") ?? "").trim();
      if (!jobId) return json({ ok: false, error: "bad_request", message: "job_id is required" }, 400);
      const job = await getImportJob(env, jobId);
      if (!job) return json({ ok: false, error: "not_found", message: "Import job not found" }, 404);
      return json({ ok: true, job });
    } catch (e: any) {
      return json({ ok: false, error: "import_status_failed", message: e?.message || "unknown" }, 500);
    }
  }

  if (path === "/v1/integrations/wowboost/status" && req.method === "GET") {
    try {
      const supabase = getSupabase(env);
      const { data, error } = await supabase.from("integrations_credentials").select("*").in("platform", ["wowsuite:wowboost", "wowboost", "wowsuite"]).order("updated_at", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      const creds = Array.isArray(data) && data.length ? (data[0] as any) : null;
      if (!creds) return json({ ok: true, connected: false, platform: "wowboost", baseUrl: null, username: null, created_at: null, updated_at: null });
      return json({ ok: true, connected: true, platform: "wowboost", baseUrl: creds.base_url ?? null, username: creds.username ?? null, created_at: creds.created_at ?? null, updated_at: creds.updated_at ?? null });
    } catch (e: any) {
      return json({ ok: false, error: "status_failed", message: e?.message || "unknown" }, 500);
    }
  }

  if (path === "/v1/integrations/wowsuite/status" && req.method === "GET") {
    try {
      const supabase = getSupabase(env);
      const { data, error } = await supabase.from("integrations_credentials").select("platform,base_url,username,created_at,updated_at").in("platform", [wowSuiteKey("wowboost"), wowSuiteKey("wowpay"), "wowboost", "wowpay", "wowsuite"]);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as any[];
      const wowboost = rows.find((r) => [wowSuiteKey("wowboost"), "wowboost", "wowsuite"].includes(String(r.platform))) || null;
      const wowpay = rows.find((r) => String(r.platform) === wowSuiteKey("wowpay") || String(r.platform) === "wowpay") || null;
      return json({ ok: true, platform: "wowsuite", connected: Boolean(wowboost || wowpay), subs: { wowboost: wowboost ? { connected: true, baseUrl: wowboost.base_url ?? null, username: wowboost.username ?? null, updated_at: wowboost.updated_at ?? null } : { connected: false }, wowpay: wowpay ? { connected: true, baseUrl: wowpay.base_url ?? null, username: wowpay.username ?? null, updated_at: wowpay.updated_at ?? null } : { connected: false } } });
    } catch (e: any) {
      return json({ ok: false, error: "status_failed", message: e?.message || "unknown" }, 500);
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
        const body = (await req.json().catch(() => ({}))) as any;
        const from = String(body.from ?? "").trim();
        const to = String(body.to ?? "").trim();
        const filter = String(body.filter ?? "all_sales").trim();

        const fromDt = parseYmd(from);
        const toDt = parseYmd(to);
        if (!fromDt || !toDt) return json({ ok: false, error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);

        const job = await createImportJob(env, { platform: wowSuiteKey("wowboost"), module: "wowboost", from, to, filter });
        ctx.waitUntil(runWowBoostImportJob(env, { jobId: job.id, from, to, filter, pageSize: 1000 }).catch((e) => { console.error("[TraceKit] wowboost async import failed", e); }));

        return json({ ok: true, job_id: job.id, status: job.status, platform: wowSuiteKey("wowboost"), module: "wowboost", from, to, filter, message: "Import job queued." });
      }

      return await router(req, env);
    } catch (e: any) {
      console.error("[TraceKit] unhandled error", e);
      return json({ ok: false, error: "server_error", message: e?.message || "unknown" }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCheckoutChampImport(env));
  },
};
