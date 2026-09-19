import { normalizeCheckoutChampTransaction } from "./transaction-evidence.ts";

export type CheckoutChampQueryCredential = { baseUrl: string; loginId: string; password: string };
export type CheckoutChampQueryWindow = { from: string; to: string; page?: number; resultsPerPage?: number };

export async function queryCheckoutChampTransactions(
  credential: CheckoutChampQueryCredential,
  window: CheckoutChampQueryWindow,
  fetchImpl: typeof fetch = fetch,
) {
  const from = ymd(window.from, "from");
  const to = ymd(window.to, "to");
  const url = new URL(`${credential.baseUrl.replace(/\/+$/, "")}/transactions/query/`);
  url.searchParams.set("loginId", credential.loginId);
  url.searchParams.set("password", credential.password);
  url.searchParams.set("startDate", mdY(from));
  url.searchParams.set("endDate", mdY(to));
  url.searchParams.set("page", String(bounded(window.page, 1, 100000, 1)));
  url.searchParams.set("resultsPerPage", String(bounded(window.resultsPerPage, 1, 500, 200)));
  const response = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Checkout Champ transaction query failed (${response.status}): ${text.slice(0,300)}`);
  let body: any;
  try { body=JSON.parse(text); } catch { throw new Error("Checkout Champ transaction query returned invalid JSON."); }
  const raw = extractRows(body);
  return {
    raw,
    normalized: raw.map(normalizeCheckoutChampTransaction).filter(Boolean),
    totalResults: Number(body?.totalResults ?? body?.total_results ?? body?.total ?? 0) || null,
  };
}

function extractRows(body:any): Record<string,unknown>[] {
  for (const key of ["message","data","transactions","results"]) if (Array.isArray(body?.[key])) return body[key];
  if (Array.isArray(body)) return body;
  return [];
}
function ymd(v:string,label:string){const d=new Date(v+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(d.getTime()))throw new Error(`Checkout Champ ${label} must be YYYY-MM-DD.`);return d;}
function mdY(d:Date){return `${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCFullYear()).slice(-2)}`;}
function bounded(v:unknown,min:number,max:number,fallback:number){const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
