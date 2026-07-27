import { cleanText } from "./identity-normalization.ts";
import {
  WORK_ITEM_ACTIVITY_SELECT,
  WORK_ITEM_SELECT,
  serializeWorkItem,
} from "./work-items.ts";

export const ENTITY_PREVIEW_ROUTE_PREFIX = "/v1/entities";
export const ENTITY_PREVIEW_LIMITS = {
  identifiers: 8,
  latest_orders: 5,
  open_work_items: 5,
  journeys: 5,
  journey_events: 12,
  credits: 5,
  commissions: 5,
  activity: 20,
};

export type EntityType = "customer" | "order" | "journey" | "work_item";

export type EntityPreviewRouteMatch =
  | { kind: "entity_preview"; entity_type: EntityType; entity_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

type EntityStatus = {
  label: string;
  tone: "success" | "warning" | "critical" | "info" | "neutral";
};

type EntityMetric = {
  label: string;
  value: string | number | null;
  unit?: string | null;
};

type RelatedEntity = {
  type: EntityType;
  id: string;
  label: string;
  subtitle?: string | null;
  href: string;
};

type EntityAction = {
  id: string;
  label: string;
  kind: "link" | "copy" | "work_item_action";
  href?: string | null;
  value?: string | null;
  action?: string | null;
  safe: boolean;
};

export type EntityPreview = {
  type: EntityType;
  id: string;
  title: string;
  subtitle: string | null;
  statuses: EntityStatus[];
  metrics: EntityMetric[];
  identifiers: Array<{ label: string; value: string }>;
  related_entities: RelatedEntity[];
  explanation: {
    title: string;
    summary: string;
    statements?: Array<{ id: string; text: string }>;
    recommended_review_steps?: string[];
  } | null;
  recent_activity: Array<{ id: string; title: string; summary: string | null; occurred_at: string | null; entity?: RelatedEntity | null }>;
  actions: EntityAction[];
  full_page_link: string;
  sections: Array<{ id: string; title: string; items: Array<{ label: string; value: unknown }> }>;
};

function normalizedPath(path: string) {
  const trimmed = String(path || "").replace(/\/+$/, "");
  return trimmed || "/";
}

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function matchEntityPreviewRoute(method: string, path: string): EntityPreviewRouteMatch | null {
  const cleanPath = normalizedPath(path);
  const match = new RegExp(`^${ENTITY_PREVIEW_ROUTE_PREFIX}/(customer|order|journey|work_item)/([^/]+)/preview$`).exec(cleanPath);
  if (!match) return null;
  const routePath = `${ENTITY_PREVIEW_ROUTE_PREFIX}/:entity_type/:id/preview`;
  if (String(method || "GET").toUpperCase() !== "GET") {
    return { kind: "method_not_allowed", path: routePath, allowed_methods: ["GET"] };
  }
  return {
    kind: "entity_preview",
    entity_type: match[1] as EntityType,
    entity_id: decodePathPart(match[2] || ""),
  };
}

function workspaceId(value: unknown) {
  return cleanText(value) || "default";
}

function money(value: unknown, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

function integer(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function timestamp(value: unknown) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function titleCase(value: unknown) {
  const text = cleanText(value).replace(/_/g, " ");
  return text ? text.replace(/\b\w/g, (char) => char.toUpperCase()) : "Unknown";
}

function statusTone(value: unknown): EntityStatus["tone"] {
  const text = cleanText(value).toLowerCase();
  if (["paid", "active", "resolved", "attributed", "generated", "completed", "healthy", "verified", "observed"].includes(text)) return "success";
  if (["pending", "draft", "open", "acknowledged", "in_progress", "unattributed", "needs_review"].includes(text)) return "warning";
  if (["failed", "critical", "chargeback", "refunded", "dismissed"].includes(text)) return "critical";
  if (["info", "new"].includes(text)) return "info";
  return "neutral";
}

function entityStatus(label: string, value?: unknown): EntityStatus {
  const actual = cleanText(value) || label;
  return { label: titleCase(actual), tone: statusTone(actual) };
}

async function rows(query: any, label: string): Promise<any[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return data || [];
}

async function maybeSingle(query: any, label: string): Promise<any | null> {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return data || null;
}

function customerName(person: any, identifiers: any[] = []) {
  return cleanText(person?.display_name)
    || cleanText(person?.first_name && person?.last_name ? `${person.first_name} ${person.last_name}` : "")
    || cleanText(person?.primary_email)
    || cleanText(person?.primary_phone)
    || cleanText(identifiers.find((item) => item.is_primary)?.raw_value)
    || "Customer";
}

function customerHref(id: unknown, workspace_id: string) {
  return `/customers/${encodeURIComponent(cleanText(id))}?workspace_id=${encodeURIComponent(workspace_id)}`;
}

function orderHref(id: unknown, workspace_id: string) {
  return `/orders/${encodeURIComponent(cleanText(id))}?workspace_id=${encodeURIComponent(workspace_id)}`;
}

function journeyHref(id: unknown, workspace_id: string) {
  return `/journeys/${encodeURIComponent(cleanText(id))}?workspace_id=${encodeURIComponent(workspace_id)}`;
}

function workItemHref(id: unknown, workspace_id: string) {
  return `/operations?workspace_id=${encodeURIComponent(workspace_id)}&inspect=work_item:${encodeURIComponent(cleanText(id))}`;
}

function relatedCustomer(person: any, workspace_id: string): RelatedEntity | null {
  if (!person?.id) return null;
  return { type: "customer", id: cleanText(person.id), label: customerName(person), subtitle: cleanText(person.primary_email) || null, href: customerHref(person.id, workspace_id) };
}

function relatedOrder(order: any, workspace_id: string): RelatedEntity | null {
  const id = cleanText(order?.platform_order_id || order?.order_id);
  if (!id) return null;
  const label = `Order ${cleanText(order?.order_id) || id}`;
  return { type: "order", id, label, subtitle: money(order?.gross_amount ?? order?.receipt_total, cleanText(order?.currency) || "USD"), href: orderHref(id, workspace_id) };
}

function relatedJourney(journey: any, workspace_id: string): RelatedEntity | null {
  const id = cleanText(journey?.id || journey?.journey_id);
  if (!id) return null;
  return { type: "journey", id, label: "Customer Journey", subtitle: timestamp(journey?.started_at || journey?.event_time), href: journeyHref(id, workspace_id) };
}

function relatedWorkItem(item: any, workspace_id: string): RelatedEntity | null {
  const id = cleanText(item?.id);
  if (!id) return null;
  return { type: "work_item", id, label: cleanText(item?.title) || "Work Item", subtitle: cleanText(item?.status || item?.priority), href: workItemHref(id, workspace_id) };
}

function uniqueRelated(entities: Array<RelatedEntity | null>) {
  const seen = new Set<string>();
  const result: RelatedEntity[] = [];
  for (const entity of entities) {
    if (!entity?.id) continue;
    const key = `${entity.type}:${entity.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entity);
  }
  return result.slice(0, 10);
}

function workItemActions(item: any): EntityAction[] {
  const status = cleanText(item?.status);
  const actions: EntityAction[] = [
    { id: "copy_link", label: "Copy link", kind: "copy", value: workItemHref(item?.id, item?.workspace_id || "default"), safe: true },
    { id: "open_full_page", label: "Open full page", kind: "link", href: workItemHref(item?.id, item?.workspace_id || "default"), safe: true },
  ];
  if (status === "open") actions.unshift({ id: "acknowledge", label: "Acknowledge", kind: "work_item_action", action: "acknowledge", safe: true });
  if (status === "open" || status === "acknowledged") actions.unshift({ id: "start", label: "Start work", kind: "work_item_action", action: "start", safe: true });
  if (status === "resolved" || status === "dismissed") actions.unshift({ id: "reopen", label: "Reopen", kind: "work_item_action", action: "reopen", safe: true });
  return actions;
}

async function customerPreview(supabase: any, workspace_id: string, id: string): Promise<EntityPreview> {
  const person = await maybeSingle(
    supabase.from("people").select("id,workspace_id,status,display_name,primary_email,primary_phone,first_name,last_name,first_seen_at,last_seen_at,created_at,updated_at,metadata").eq("workspace_id", workspace_id).eq("id", id),
    "Customer preview person lookup",
  );
  if (!person) {
    const error: any = new Error("Customer not found.");
    error.status = 404;
    error.code = "entity_not_found";
    throw error;
  }
  const [identifiers, orders, workItems, journeys, credits] = await Promise.all([
    rows(supabase.from("person_identifiers").select("identifier_type,raw_value,normalized_value,is_primary,verification_status,updated_at").eq("workspace_id", workspace_id).eq("person_id", id).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.identifiers), "Customer preview identifiers"),
    rows(supabase.from("platform_orders").select("platform_order_id,order_id,platform,status,status_norm,gross_amount,receipt_total,currency,order_ts,person_id,customer_email,customer_email_normalized").eq("workspace_id", workspace_id).eq("person_id", id).order("order_ts", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.latest_orders), "Customer preview orders"),
    rows(supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", workspace_id).eq("related_person_id", id).in("status", ["open", "acknowledged", "in_progress"]).order("updated_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.open_work_items), "Customer preview Work Items"),
    rows(supabase.from("journeys").select("id,person_id,started_at,ended_at,status,event_count,purchase_count,conversion_count,total_revenue").eq("workspace_id", workspace_id).eq("person_id", id).order("started_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.journeys), "Customer preview journeys"),
    rows(supabase.from("journey_attribution_credits").select("id,journey_id,conversion_event_id,touchpoint_event_id,status,model,credit_amount,currency,affiliate_id,source,medium,conversion_event_time").eq("workspace_id", workspace_id).eq("person_id", id).order("conversion_event_time", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.credits), "Customer preview attribution"),
  ]);
  const revenue = orders.reduce((sum, order) => sum + (Number(order.gross_amount ?? order.receipt_total) || 0), 0);
  const openCount = workItems.length;
  const name = customerName(person, identifiers);
  return {
    type: "customer",
    id,
    title: name,
    subtitle: `Customer${openCount ? ` · ${openCount} open Work Item${openCount === 1 ? "" : "s"}` : ""}`,
    statuses: [entityStatus("Customer", person.status), entityStatus("Identity resolved", identifiers.length ? "resolved" : "pending")],
    metrics: [
      { label: "Lifetime revenue", value: money(revenue, cleanText(orders[0]?.currency) || "USD") },
      { label: "Orders", value: integer(orders.length) },
      { label: "Journeys", value: integer(journeys.length) },
      { label: "Last activity", value: timestamp(person.last_seen_at || person.updated_at || orders[0]?.order_ts) },
    ],
    identifiers: [
      { label: "Customer ID", value: id },
      ...identifiers.slice(0, 4).map((item) => ({ label: titleCase(item.identifier_type), value: cleanText(item.raw_value || item.normalized_value) })).filter((item) => item.value),
    ],
    related_entities: uniqueRelated([
      ...orders.map((order) => relatedOrder(order, workspace_id)),
      ...journeys.map((journey) => relatedJourney(journey, workspace_id)),
      ...workItems.map((item) => relatedWorkItem(item, workspace_id)),
    ]),
    explanation: {
      title: "Customer summary",
      summary: `${name} has ${orders.length} recent order${orders.length === 1 ? "" : "s"} and ${credits.length} recent attribution credit${credits.length === 1 ? "" : "s"} in this bounded preview.`,
      recommended_review_steps: openCount ? ["Review open Work Items before relying on downstream attribution or commission status."] : ["Open Customer 360 for full commercial history and technical evidence."],
    },
    recent_activity: [
      ...orders.map((order) => ({ id: cleanText(order.platform_order_id), title: `Order ${cleanText(order.order_id || order.platform_order_id)}`, summary: money(order.gross_amount ?? order.receipt_total, cleanText(order.currency) || "USD"), occurred_at: timestamp(order.order_ts), entity: relatedOrder(order, workspace_id) })),
      ...workItems.map((item) => ({ id: cleanText(item.id), title: cleanText(item.title), summary: cleanText(item.summary), occurred_at: timestamp(item.updated_at), entity: relatedWorkItem(item, workspace_id) })),
    ].sort((a, b) => Date.parse(b.occurred_at || "") - Date.parse(a.occurred_at || "")).slice(0, 8),
    actions: [
      { id: "copy_link", label: "Copy link", kind: "copy", value: customerHref(id, workspace_id), safe: true },
      { id: "copy_id", label: "Copy customer ID", kind: "copy", value: id, safe: true },
      { id: "open_full_page", label: "Open full Customer 360", kind: "link", href: customerHref(id, workspace_id), safe: true },
    ],
    full_page_link: customerHref(id, workspace_id),
    sections: [
      { id: "contact", title: "Contact Summary", items: identifiers.slice(0, 5).map((item) => ({ label: titleCase(item.identifier_type), value: cleanText(item.raw_value || item.normalized_value) })) },
      { id: "latest_orders", title: "Latest Orders", items: orders.map((order) => ({ label: cleanText(order.order_id || order.platform_order_id), value: `${money(order.gross_amount ?? order.receipt_total, cleanText(order.currency) || "USD")} · ${titleCase(order.status_norm || order.status)}` })) },
      { id: "open_work_items", title: "Open Work Items", items: workItems.map((item) => ({ label: titleCase(item.priority), value: cleanText(item.title) })) },
    ],
  };
}

async function orderPreview(supabase: any, workspace_id: string, id: string): Promise<EntityPreview> {
  const order = await maybeSingle(
    supabase.from("platform_orders").select("workspace_id,person_id,platform,platform_order_id,order_id,order_ts,status,status_norm,gross_amount,receipt_total,currency,transaction_id,everflow_transaction_id,affiliate_id,commerce_reference,customer_email,customer_email_normalized").eq("workspace_id", workspace_id).or(`platform_order_id.eq.${id},order_id.eq.${id}`).order("order_ts", { ascending: false }).limit(1),
    "Order preview lookup",
  );
  if (!order) {
    const error: any = new Error("Order not found.");
    error.status = 404;
    error.code = "entity_not_found";
    throw error;
  }
  const orderEntityId = cleanText(order.platform_order_id || order.order_id);
  const [person, workItems, journeyEvents, credits, commissions] = await Promise.all([
    order.person_id ? maybeSingle(supabase.from("people").select("id,display_name,primary_email,primary_phone,status,last_seen_at").eq("workspace_id", workspace_id).eq("id", order.person_id), "Order preview customer").catch(() => null) : Promise.resolve(null),
    rows(supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", workspace_id).or(`related_order_id.eq.${orderEntityId},related_order_id.eq.${cleanText(order.order_id)}`).order("updated_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.open_work_items), "Order preview Work Items").catch(() => []),
    rows(supabase.from("journey_events").select("id,journey_id,person_id,event_type,event_time,amount,currency,affiliate_id,source,medium").eq("workspace_id", workspace_id).eq("platform_order_id", orderEntityId).order("event_time", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.activity), "Order preview journey events").catch(() => []),
    rows(supabase.from("journey_attribution_credits").select("id,journey_id,conversion_event_id,touchpoint_event_id,status,model,credit_amount,currency,affiliate_id,source,medium,conversion_event_time").eq("workspace_id", workspace_id).or(`conversion_event_id.eq.${orderEntityId},conversion_event_id.eq.${cleanText(order.order_id)}`).order("conversion_event_time", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.credits), "Order preview attribution").catch(() => []),
    rows(supabase.from("affiliate_commissions").select("id,journey_id,conversion_event_id,status,model,commission_amount,currency,affiliate_id,publisher_id,generated_at").eq("workspace_id", workspace_id).or(`conversion_event_id.eq.${orderEntityId},conversion_event_id.eq.${cleanText(order.order_id)}`).order("generated_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.commissions), "Order preview commissions").catch(() => []),
  ]);
  const journeyIds = Array.from(new Set(journeyEvents.map((event) => cleanText(event.journey_id)).filter(Boolean)));
  const title = `Order ${cleanText(order.order_id) || orderEntityId}`;
  return {
    type: "order",
    id: orderEntityId,
    title,
    subtitle: person ? customerName(person) : cleanText(order.customer_email || order.customer_email_normalized),
    statuses: [
      entityStatus("Order", order.status_norm || order.status),
      entityStatus(credits.some((credit) => cleanText(credit.status) === "attributed") ? "Attributed" : "Attribution pending"),
      entityStatus(commissions.length ? "Commission generated" : "Commission pending"),
    ],
    metrics: [
      { label: "Order value", value: money(order.gross_amount ?? order.receipt_total, cleanText(order.currency) || "USD") },
      { label: "Purchased", value: timestamp(order.order_ts) },
      { label: "Attribution credits", value: integer(credits.length) },
      { label: "Commissions", value: integer(commissions.length) },
    ],
    identifiers: [
      { label: "Platform order ID", value: orderEntityId },
      { label: "Order ID", value: cleanText(order.order_id) },
      { label: "Transaction ID", value: cleanText(order.transaction_id) },
      { label: "Commerce reference", value: cleanText(order.commerce_reference) },
    ].filter((item) => item.value),
    related_entities: uniqueRelated([
      relatedCustomer(person, workspace_id),
      ...journeyIds.map((journeyId) => relatedJourney({ id: journeyId, event_time: journeyEvents.find((event) => cleanText(event.journey_id) === journeyId)?.event_time }, workspace_id)),
      ...workItems.map((item) => relatedWorkItem(item, workspace_id)),
    ]),
    explanation: {
      title: "Order summary",
      summary: `${title} is shown with stored attribution and commission records only. This preview does not recalculate attribution.`,
      recommended_review_steps: credits.length ? ["Open the journey to inspect the credited touchpoint story."] : ["Review attribution Work Items if this purchase should have a marketing touchpoint."],
    },
    recent_activity: [
      ...journeyEvents.map((event) => ({ id: cleanText(event.id), title: titleCase(event.event_type), summary: cleanText(event.source || event.affiliate_id), occurred_at: timestamp(event.event_time), entity: event.journey_id ? relatedJourney({ id: event.journey_id, event_time: event.event_time }, workspace_id) : null })),
      ...workItems.map((item) => ({ id: cleanText(item.id), title: cleanText(item.title), summary: cleanText(item.summary), occurred_at: timestamp(item.updated_at), entity: relatedWorkItem(item, workspace_id) })),
    ].slice(0, 10),
    actions: [
      ...(person ? [{ id: "open_customer", label: "Open customer", kind: "link" as const, href: customerHref(person.id, workspace_id), safe: true }] : []),
      { id: "copy_link", label: "Copy link", kind: "copy", value: orderHref(orderEntityId, workspace_id), safe: true },
      { id: "copy_id", label: "Copy order ID", kind: "copy", value: orderEntityId, safe: true },
      { id: "open_full_page", label: "Open full page", kind: "link", href: orderHref(orderEntityId, workspace_id), safe: true },
    ],
    full_page_link: orderHref(orderEntityId, workspace_id),
    sections: [
      { id: "attribution", title: "Attribution", items: credits.map((credit) => ({ label: titleCase(credit.model), value: `${titleCase(credit.status)} · ${money(credit.credit_amount, cleanText(credit.currency) || cleanText(order.currency) || "USD")}` })) },
      { id: "commission", title: "Commission", items: commissions.map((commission) => ({ label: titleCase(commission.status), value: `${money(commission.commission_amount, cleanText(commission.currency) || cleanText(order.currency) || "USD")} · ${cleanText(commission.affiliate_id || commission.publisher_id)}` })) },
      { id: "work_items", title: "Related Work Items", items: workItems.map((item) => ({ label: titleCase(item.priority), value: cleanText(item.title) })) },
    ],
  };
}

async function journeyPreview(supabase: any, workspace_id: string, id: string): Promise<EntityPreview> {
  const journey = await maybeSingle(
    supabase.from("journeys").select("id,workspace_id,person_id,started_at,ended_at,status,entry_event_id,conversion_event_id,conversion_count,purchase_count,total_revenue,event_count,metadata,updated_at").eq("workspace_id", workspace_id).eq("id", id),
    "Journey preview lookup",
  );
  if (!journey) {
    const error: any = new Error("Journey not found.");
    error.status = 404;
    error.code = "entity_not_found";
    throw error;
  }
  const [person, events, credits, workItems] = await Promise.all([
    journey.person_id ? maybeSingle(supabase.from("people").select("id,display_name,primary_email,primary_phone,status,last_seen_at").eq("workspace_id", workspace_id).eq("id", journey.person_id), "Journey preview customer").catch(() => null) : Promise.resolve(null),
    rows(supabase.from("journey_events").select("id,journey_id,person_id,platform_order_id,event_type,event_time,source_platform,amount,currency,affiliate_id,source,medium").eq("workspace_id", workspace_id).eq("journey_id", id).order("event_time", { ascending: true }).limit(ENTITY_PREVIEW_LIMITS.journey_events), "Journey preview events"),
    rows(supabase.from("journey_attribution_credits").select("id,journey_id,conversion_event_id,touchpoint_event_id,status,model,credit_amount,currency,affiliate_id,source,medium,conversion_event_time,touchpoint_event_time").eq("workspace_id", workspace_id).eq("journey_id", id).order("conversion_event_time", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.credits), "Journey preview credits").catch(() => []),
    rows(supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", workspace_id).eq("related_journey_id", id).order("updated_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.open_work_items), "Journey preview Work Items").catch(() => []),
  ]);
  const attributed = credits.find((credit) => cleanText(credit.status) === "attributed");
  return {
    type: "journey",
    id,
    title: "Customer Journey",
    subtitle: person ? `${customerName(person)} · Started ${timestamp(journey.started_at) || "Unknown"}` : `Started ${timestamp(journey.started_at) || "Unknown"}`,
    statuses: [
      entityStatus("Journey", journey.status),
      entityStatus(attributed ? "Attributed" : "Attribution pending"),
    ],
    metrics: [
      { label: "Touchpoints", value: integer(journey.event_count || events.length) },
      { label: "Conversions", value: integer(journey.conversion_count) },
      { label: "Purchases", value: integer(journey.purchase_count) },
      { label: "Revenue", value: money(journey.total_revenue, cleanText(events.find((event) => event.currency)?.currency) || "USD") },
    ],
    identifiers: [{ label: "Journey ID", value: id }, { label: "Customer ID", value: cleanText(journey.person_id) }].filter((item) => item.value),
    related_entities: uniqueRelated([
      relatedCustomer(person, workspace_id),
      ...events.filter((event) => event.platform_order_id).map((event) => relatedOrder({ platform_order_id: event.platform_order_id, order_id: event.platform_order_id, gross_amount: event.amount, currency: event.currency, order_ts: event.event_time }, workspace_id)),
      ...workItems.map((item) => relatedWorkItem(item, workspace_id)),
    ]),
    explanation: {
      title: "Journey summary",
      summary: attributed
        ? `Stored attribution credits this journey to ${cleanText(attributed.affiliate_id || attributed.source || attributed.medium || attributed.model) || "a recorded touchpoint"}.`
        : "This condensed preview shows stored journey events; open the full Journey Explorer for Story and Technical modes.",
      recommended_review_steps: ["Review the full Journey Explorer for complete event evidence and attribution context."],
    },
    recent_activity: events.map((event) => ({
      id: cleanText(event.id),
      title: titleCase(event.event_type),
      summary: cleanText(event.source || event.medium || event.affiliate_id || event.source_platform),
      occurred_at: timestamp(event.event_time),
      entity: event.platform_order_id ? relatedOrder({ platform_order_id: event.platform_order_id, order_id: event.platform_order_id, gross_amount: event.amount, currency: event.currency, order_ts: event.event_time }, workspace_id) : null,
    })),
    actions: [
      ...(person ? [{ id: "open_customer", label: "Open customer", kind: "link" as const, href: customerHref(person.id, workspace_id), safe: true }] : []),
      { id: "copy_link", label: "Copy link", kind: "copy", value: journeyHref(id, workspace_id), safe: true },
      { id: "copy_id", label: "Copy journey ID", kind: "copy", value: id, safe: true },
      { id: "open_full_page", label: "Open full Journey Explorer", kind: "link", href: journeyHref(id, workspace_id), safe: true },
    ],
    full_page_link: journeyHref(id, workspace_id),
    sections: [
      { id: "story", title: "Condensed Story", items: events.map((event) => ({ label: titleCase(event.event_type), value: [timestamp(event.event_time), cleanText(event.source || event.affiliate_id), event.amount ? money(event.amount, cleanText(event.currency) || "USD") : ""].filter(Boolean).join(" · ") })) },
      { id: "attribution", title: "Stored Attribution", items: credits.map((credit) => ({ label: titleCase(credit.model), value: `${titleCase(credit.status)} · ${money(credit.credit_amount, cleanText(credit.currency) || "USD")}` })) },
    ],
  };
}

async function workItemPreview(supabase: any, workspace_id: string, id: string): Promise<EntityPreview> {
  const item = await maybeSingle(
    supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", workspace_id).eq("id", id),
    "Work Item preview lookup",
  );
  if (!item) {
    const error: any = new Error("Work Item not found.");
    error.status = 404;
    error.code = "entity_not_found";
    throw error;
  }
  const [activity, person, orderRows] = await Promise.all([
    rows(supabase.from("work_item_activity").select(WORK_ITEM_ACTIVITY_SELECT).eq("workspace_id", workspace_id).eq("work_item_id", id).order("created_at", { ascending: false }).limit(ENTITY_PREVIEW_LIMITS.activity), "Work Item preview activity"),
    item.related_person_id ? maybeSingle(supabase.from("people").select("id,display_name,primary_email,primary_phone,status,last_seen_at").eq("workspace_id", workspace_id).eq("id", item.related_person_id), "Work Item preview customer").catch(() => null) : Promise.resolve(null),
    item.related_order_id ? rows(supabase.from("platform_orders").select("platform_order_id,order_id,person_id,gross_amount,receipt_total,currency,status,status_norm,order_ts").eq("workspace_id", workspace_id).or(`platform_order_id.eq.${item.related_order_id},order_id.eq.${item.related_order_id}`).limit(2), "Work Item preview order").catch(() => []) : Promise.resolve([]),
  ]);
  const serialized = serializeWorkItem(item);
  const order = orderRows[0] || null;
  return {
    type: "work_item",
    id,
    title: cleanText(serialized.title) || "Work Item",
    subtitle: `${titleCase(serialized.priority)} priority · ${titleCase(serialized.status)}`,
    statuses: [entityStatus("Priority", serialized.priority), entityStatus("Workflow", serialized.status), entityStatus("Lifecycle", serialized.lifecycle_state)],
    metrics: [
      { label: "Open for", value: timestamp(serialized.first_detected_at) },
      { label: "Assignee", value: cleanText(serialized.assigned_to) || "Unassigned" },
      { label: "Activity entries", value: integer(activity.length) },
      { label: "Recurrence", value: integer(serialized.recurrence_count || 0) },
    ],
    identifiers: [{ label: "Work Item ID", value: id }, { label: "Source key", value: cleanText(serialized.source_key) }].filter((identifier) => identifier.value),
    related_entities: uniqueRelated([
      relatedCustomer(person, workspace_id),
      relatedOrder(order, workspace_id),
      serialized.related_journey_id ? relatedJourney({ id: serialized.related_journey_id }, workspace_id) : null,
    ]),
    explanation: serialized.explanation ? {
      title: serialized.explanation.title || "Explanation",
      summary: serialized.explanation.summary || serialized.summary,
      statements: (serialized.explanation.statements || []).slice(0, 5).map((statement: any) => ({ id: cleanText(statement.id), text: cleanText(statement.text) })),
      recommended_review_steps: (serialized.explanation.recommended_review_steps || []).slice(0, 5),
    } : {
      title: "Issue summary",
      summary: cleanText(serialized.summary),
    },
    recent_activity: activity.map((event: any) => ({ id: cleanText(event.id || `${event.activity_type}:${event.created_at}`), title: titleCase(event.activity_type), summary: cleanText(event.body), occurred_at: timestamp(event.created_at), entity: null })),
    actions: workItemActions(serialized),
    full_page_link: workItemHref(id, workspace_id),
    sections: [
      { id: "issue", title: "Issue", items: [{ label: "Summary", value: serialized.summary }, { label: "Category", value: titleCase(serialized.category) }, { label: "Source", value: titleCase(serialized.source) }] },
      { id: "review", title: "What To Review", items: (serialized.explanation?.recommended_review_steps || []).slice(0, 5).map((step: string, index: number) => ({ label: `Step ${index + 1}`, value: step })) },
      { id: "evidence", title: "Bounded Evidence", items: Object.entries(serialized.evidence || {}).slice(0, 12).map(([label, value]) => ({ label, value: typeof value === "object" ? "[structured evidence]" : value })) },
    ],
  };
}

export async function getEntityPreview(supabase: any, args: { workspace_id?: unknown; entity_type: EntityType; entity_id: string }) {
  const scopedWorkspace = workspaceId(args.workspace_id);
  const entityId = cleanText(args.entity_id);
  if (!entityId) {
    const error: any = new Error("Entity id is required.");
    error.status = 400;
    error.code = "bad_request";
    throw error;
  }
  let entity: EntityPreview;
  if (args.entity_type === "customer") entity = await customerPreview(supabase, scopedWorkspace, entityId);
  else if (args.entity_type === "order") entity = await orderPreview(supabase, scopedWorkspace, entityId);
  else if (args.entity_type === "journey") entity = await journeyPreview(supabase, scopedWorkspace, entityId);
  else entity = await workItemPreview(supabase, scopedWorkspace, entityId);
  return {
    ok: true,
    workspace_id: scopedWorkspace,
    entity,
    limits: ENTITY_PREVIEW_LIMITS,
  };
}
