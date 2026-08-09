// Aggregate-only forensic audit. It never emits source values or raw rows.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { parse } from "fast-csv";
import { EVERFLOW_REPORT_HEADERS } from "./historical-report.ts";
import { EverflowSchemaProfiler, SafeParameterProfiler, classifyNandiFailure } from "./linkage-analysis.ts";

const FILE = process.env.EVERFLOW_REPORT_PATH;
if (!FILE) throw new Error("EVERFLOW_REPORT_PATH must reference the approved local report.");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => { const parsed = Number(text(value)); return Number.isFinite(parsed) && text(value) !== "" ? parsed : null; };
const day = (value: string) => value.slice(0, 10);
type CountMap = Map<string, number>;
const add = (map: CountMap, value: string) => map.set(hash(value), (map.get(hash(value)) ?? 0) + 1);

async function restAll(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Scoped local persistence configuration unavailable.");
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}`, Prefer: "count=none" } });
    if (!response.ok) throw new Error(`Scoped local persistence query failed (${response.status}).`);
    const page = await response.json() as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

type Group = { events: number; eventNames: Set<string>; orderIds: Set<string>; conversionIds: Set<string>; saleAmounts: Set<number>; revenues: Set<number>; emails: Set<string>; dates: string[]; affiliate: string; sub1: string };
type RawEvent = { transaction: string; email: string; at: number; sale: number | null; revenue: number | null; affiliate: string; sub1: string; eventName: string };

async function main() {
const profiler = new EverflowSchemaProfiler(EVERFLOW_REPORT_HEADERS), parameters = new SafeParameterProfiler();
const candidateFields = EVERFLOW_REPORT_HEADERS.filter((field) => /(^|_)(id|number)$|transaction|order|checkout|session|click|source|^c[1-5]$|^sub\d+$|^adv\d+$|url|referer|origin|metadata|custom|tracking|line_items/i.test(field));
const candidateCounts = new Map(candidateFields.map((field) => [field, new Map<string, number>()]));
const parameterCounts = new Map<string, CountMap>();
const groups = new Map<string, Group>();
const rawEvents: RawEvent[] = [], eventCounts = new Map<string, number>(), amountByEvent = new Map<string, { rows: number; sale: number[]; revenue: number[] }>();
const timestampFormats = new Map<string, number>();
const nandiTransactions = new Set<string>();
let rows = 0;

await new Promise<void>((resolve, reject) => {
  const stream = parse({ headers: true, strictColumnHandling: true, ignoreEmpty: true });
  stream.on("data", (row: Record<string, string>) => {
    rows++; profiler.observe(row, row.transaction_id);
    for (const field of ["date", "click_date"]) {
      const value = text(row[field]); if (!value) continue;
      const marker = /Z$/i.test(value) ? "explicit_utc" : /[+-]\d\d:?\d\d$/.test(value) ? "explicit_offset" : "timezone_naive";
      const key = `${field}:${marker}`; timestampFormats.set(key, (timestampFormats.get(key) ?? 0) + 1);
    }
    for (const field of EVERFLOW_REPORT_HEADERS) {
      const value = text(row[field]); if (!value) continue;
      parameters.observe(field, value);
      if (candidateCounts.has(field)) add(candidateCounts.get(field)!, value);
      try {
        const url = new URL(value);
        for (const [key, item] of url.searchParams) {
          if (!item) continue; const path = `${field}.query.${key.toLowerCase()}`;
          const map = parameterCounts.get(path) ?? new Map<string, number>(); add(map, item); parameterCounts.set(path, map);
        }
      } catch { /* no URL value */ }
    }
    const transaction = text(row.transaction_id); if (!transaction) return;
    const key = hash(transaction), group = groups.get(key) ?? { events: 0, eventNames: new Set(), orderIds: new Set(), conversionIds: new Set(), saleAmounts: new Set(), revenues: new Set(), emails: new Set(), dates: [], affiliate: text(row.network_affiliate_name).toLowerCase(), sub1: text(row.sub1).toLowerCase() };
    group.events++;
    if (text(row.event_name)) group.eventNames.add(text(row.event_name));
    if (text(row.order_id)) group.orderIds.add(hash(text(row.order_id)));
    if (text(row.conversion_id)) group.conversionIds.add(hash(text(row.conversion_id)));
    if (number(row.sale_amount) !== null) group.saleAmounts.add(number(row.sale_amount)!);
    if (number(row.revenue) !== null) group.revenues.add(number(row.revenue)!);
    if (text(row.email)) group.emails.add(hash(text(row.email).toLowerCase()));
    if (text(row.date)) group.dates.push(new Date(row.date).toISOString());
    groups.set(key, group);
    const eventName = text(row.event_name) || "unknown";
    eventCounts.set(eventName, (eventCounts.get(eventName) ?? 0) + 1);
    const amount = amountByEvent.get(eventName) ?? { rows: 0, sale: [], revenue: [] }; amount.rows++;
    if (number(row.sale_amount) !== null) amount.sale.push(number(row.sale_amount)!);
    if (number(row.revenue) !== null) amount.revenue.push(number(row.revenue)!);
    amountByEvent.set(eventName, amount);
    if (text(row.email) && text(row.date)) {
      const raw = { transaction: key, email: hash(text(row.email).toLowerCase()), at: new Date(row.date).valueOf(), sale: number(row.sale_amount), revenue: number(row.revenue), affiliate: text(row.network_affiliate_name).toLowerCase(), sub1: text(row.sub1).toLowerCase(), eventName };
      rawEvents.push(raw); if (raw.affiliate === "pear media llc" && raw.sub1 === "nandi") nandiTransactions.add(key);
    }
  });
  stream.on("error", reject); stream.on("end", resolve); createReadStream(FILE).pipe(stream);
});

const [orders, identities, products, refunds, reconciliations, events] = await Promise.all([
  restAll("platform_orders?platform=eq.commas&select=canonical_order_id,provider_order_id,payment_reference,person_id,order_ts,gross_amount,provider_product_id&order=canonical_order_id"),
  restAll("person_source_identities?select=id,person_id,source_type,source_id,normalized_value&order=id"),
  restAll("commerce_provider_products?select=id,provider_product_id&order=id"),
  restAll("commerce_refund_events?select=id,provider_refund_id,provider_payment_id&order=id"),
  restAll("everflow_order_reconciliations?algorithm_version=eq.everflow-commerce-v1&matched_canonical_order_id=not.is.null&select=id,event_id,matched_canonical_order_id&order=id"),
  restAll("everflow_conversion_events?select=id,conversion_at,transaction_id&order=id")
]);

const commas = new Map<string, CountMap>();
const collect = (field: string, values: unknown[]) => { const map = new Map<string, number>(); for (const value of values) if (text(value)) add(map, text(value)); commas.set(field, map); };
collect("provider_order_id", orders.map((row) => row.provider_order_id));
collect("payment_reference", orders.map((row) => row.payment_reference));
collect("provider_customer_id", identities.filter((row) => row.source_type === "provider_customer_id").map((row) => row.source_id));
collect("provider_product_id", products.map((row) => row.provider_product_id));
collect("provider_refund_id", refunds.map((row) => row.provider_refund_id));
collect("provider_refund_payment_id", refunds.map((row) => row.provider_payment_id));

const comparisons: Record<string, unknown>[] = [];
const compare = (field: string, values: CountMap) => {
  for (const [commasField, right] of commas) {
    let matchedKeys = 0, exactMatches = 0, oneToOne = 0, oneToMany = 0, manyToOne = 0;
    for (const [key, leftCount] of values) { const rightCount = right.get(key) ?? 0; if (!rightCount) continue; matchedKeys++; exactMatches += Math.min(leftCount, rightCount); if (leftCount === 1 && rightCount === 1) oneToOne++; else if (leftCount === 1) oneToMany++; else if (rightCount === 1) manyToOne++; }
    if (matchedKeys) comparisons.push({ everflowField: field, commasField, everflowDistinct: values.size, commasDistinct: right.size, matchedKeys, exactMatches, uniqueOneToOne: oneToOne, oneToMany, manyToOne, collisionRate: (oneToMany + manyToOne) / matchedKeys, deterministic: oneToOne >= 10 && oneToMany + manyToOne === 0 && oneToOne / Math.min(values.size, right.size) >= .01 });
  }
};
for (const [field, values] of candidateCounts) compare(field, values);
for (const [field, values] of parameterCounts) compare(field, values);

const emailsByPerson = new Map<string, Set<string>>();
for (const identity of identities) if (identity.source_type === "email" && text(identity.normalized_value)) { const values = emailsByPerson.get(String(identity.person_id)) ?? new Set<string>(); values.add(hash(text(identity.normalized_value).toLowerCase())); emailsByPerson.set(String(identity.person_id), values); }
const ordersByEmail = new Map<string, typeof orders>();
for (const order of orders) for (const email of emailsByPerson.get(String(order.person_id)) ?? []) { const values = ordersByEmail.get(email) ?? []; values.push(order); ordersByEmail.set(email, values); }

const shifted = { events: 0, unique: 0, ambiguous: 0, none: 0, saleExact: 0, revenueExact: 0 };
const shiftedOrdersByTransaction = new Map<string, Set<string>>(), shiftedAmbiguousTransactions = new Set<string>();
const shiftedNandi = { events: 0, uniqueEvents: 0, ambiguousEvents: 0, unmatchedEvents: 0, transactionsWithOrder: new Set<string>(), transactionsWithMultipleOrders: new Set<string>() };
for (const event of rawEvents) {
  shifted.events++;
  const candidates = (ordersByEmail.get(event.email) ?? []).filter((order) => Math.abs(new Date(String(order.order_ts)).valueOf() - (event.at - 180 * 60_000)) <= 120_000);
  if (candidates.length === 1) {
    shifted.unique++;
    if (event.sale !== null && Number(candidates[0].gross_amount) === event.sale) shifted.saleExact++;
    if (event.revenue !== null && Number(candidates[0].gross_amount) === event.revenue) shifted.revenueExact++;
    const set = shiftedOrdersByTransaction.get(event.transaction) ?? new Set<string>(); set.add(String(candidates[0].canonical_order_id)); shiftedOrdersByTransaction.set(event.transaction, set);
  } else if (candidates.length > 1) { shifted.ambiguous++; shiftedAmbiguousTransactions.add(event.transaction); }
  else shifted.none++;
  if (event.affiliate === "pear media llc" && event.sub1 === "nandi") {
    shiftedNandi.events++;
    if (candidates.length === 1) { shiftedNandi.uniqueEvents++; shiftedNandi.transactionsWithOrder.add(event.transaction); }
    else if (candidates.length > 1) shiftedNandi.ambiguousEvents++;
    else shiftedNandi.unmatchedEvents++;
  }
}
for (const [transaction, mappedOrders] of shiftedOrdersByTransaction) if (mappedOrders.size > 1 && nandiTransactions.has(transaction)) shiftedNandi.transactionsWithMultipleOrders.add(transaction);

const nandiFailures = new Map<string, number>(), nandiJourney = { groups: 0, contact: 0, uniqueSameDay: 0, multipleSameDay: 0, compatibleAmount: 0 };
for (const group of groups.values()) {
  if (group.affiliate !== "pear media llc" || group.sub1 !== "nandi") continue;
  nandiJourney.groups++;
  const candidates = [...group.emails].flatMap((email) => ordersByEmail.get(email) ?? []);
  const uniqueCandidates = [...new Map(candidates.map((order) => [String(order.canonical_order_id), order])).values()];
  if (uniqueCandidates.length) nandiJourney.contact++;
  const dates = new Set(group.dates.map(day));
  const sameDay = uniqueCandidates.filter((order) => dates.has(day(String(order.order_ts))));
  const amounts = new Set([...group.saleAmounts, ...group.revenues]);
  const amountMatches = sameDay.filter((order) => amounts.has(Number(order.gross_amount)));
  if (sameDay.length === 1) nandiJourney.uniqueSameDay++;
  if (sameDay.length > 1) nandiJourney.multipleSameDay++;
  if (amountMatches.length) nandiJourney.compatibleAmount++;
  const reason = classifyNandiFailure({ contactCandidates: uniqueCandidates.length, dateCandidates: sameDay.length, amountCandidates: amountMatches.length, productCompatible: true, identifierMatch: false });
  nandiFailures.set(reason, (nandiFailures.get(reason) ?? 0) + 1);
}

const eventById = new Map(events.map((event) => [String(event.id), event]));
const orderById = new Map(orders.map((order) => [String(order.canonical_order_id), order]));
const offsets = new Map<number, number>();
for (const reconciliation of reconciliations) {
  const event = eventById.get(String(reconciliation.event_id)), order = orderById.get(String(reconciliation.matched_canonical_order_id));
  if (!event || !order) continue;
  const minutes = Math.round((new Date(String(order.order_ts)).valueOf() - new Date(String(event.conversion_at)).valueOf()) / 60_000);
  offsets.set(minutes, (offsets.get(minutes) ?? 0) + 1);
}

const groupSummary = {
  groups: groups.size,
  multiEventGroups: [...groups.values()].filter((group) => group.events > 1).length,
  maxEvents: Math.max(...[...groups.values()].map((group) => group.events)),
  multipleEventNames: [...groups.values()].filter((group) => group.eventNames.size > 1).length,
  multipleOrderIds: [...groups.values()].filter((group) => group.orderIds.size > 1).length,
  multipleConversionIds: [...groups.values()].filter((group) => group.conversionIds.size > 1).length,
  varyingSaleAmount: [...groups.values()].filter((group) => group.saleAmounts.size > 1).length,
  varyingRevenue: [...groups.values()].filter((group) => group.revenues.size > 1).length,
  multipleEmails: [...groups.values()].filter((group) => group.emails.size > 1).length,
};

const range = (values: number[]) => ({ count: values.length, distinct: new Set(values).size, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null });
const shiftedGroups = {
  withUniqueOrderEvidence: shiftedOrdersByTransaction.size,
  withMultipleOrders: [...shiftedOrdersByTransaction.values()].filter((value) => value.size > 1).length,
  withOneOrder: [...shiftedOrdersByTransaction.values()].filter((value) => value.size === 1).length,
  ambiguousTransactions: shiftedAmbiguousTransactions.size,
  maxOrdersPerGroup: Math.max(0, ...[...shiftedOrdersByTransaction.values()].map((value) => value.size)),
};

const output = {
  rows, fieldProfiles: profiler.finish(), parameterPaths: parameters.finish(), identifierComparisons: comparisons,
  transactionGroups: groupSummary,
  eventTypes: [...eventCounts].map(([eventName, count]) => ({ eventName, count })).sort((a, b) => b.count - a.count),
  amountSemantics: [...amountByEvent].map(([eventName, value]) => ({ eventName, rows: value.rows, saleAmount: range(value.sale), revenue: range(value.revenue) })).sort((a, b) => b.rows - a.rows),
  amountFields: profiler.finish().filter((profile) => profile.category === "amount"),
  timestampFields: profiler.finish().filter((profile) => profile.category === "timestamp"),
  linkedOffsetMinutes: [...offsets].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([minutes, count]) => ({ minutes, count })),
  timestampFormats: Object.fromEntries(timestampFormats),
  normalizedTimeBridge: { rule: "everflow_conversion_at_minus_180_minutes_within_120_seconds_and_exact_contact", ...shifted, groups: shiftedGroups },
  nandi: { ...nandiJourney, failures: Object.fromEntries(nandiFailures) },
  normalizedTimeBridgeNandi: { events: shiftedNandi.events, uniqueEvents: shiftedNandi.uniqueEvents, ambiguousEvents: shiftedNandi.ambiguousEvents, unmatchedEvents: shiftedNandi.unmatchedEvents, transactionsWithOrder: shiftedNandi.transactionsWithOrder.size, transactionsWithMultipleOrders: shiftedNandi.transactionsWithMultipleOrders.size },
  sourceCounts: { orders: orders.length, identities: identities.length, products: products.length, refunds: refunds.length, linkedEvents: reconciliations.length },
};
console.log(JSON.stringify(output));
}

void main();
