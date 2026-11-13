import { formatObservedMoney } from "@/lib/reporting/observed-money";
import type { OrderDrawerRecord, OrderTimelineEvent, OrderWorkspaceSnapshot } from "./types";

// Present only the already-authorized workspace snapshot. No legacy profit read.
export function orderContextDrawer(snapshot: OrderWorkspaceSnapshot, id: string): OrderDrawerRecord | null {
  if (id !== "order:summary" && id !== "attribution:summary") return null;
  const attribution = id === "attribution:summary";
  return {
    id, mode: "journey", title: attribution ? `Order ${snapshot.order.number} attribution` : `Order ${snapshot.order.number}`,
    question: attribution ? "What attribution evidence is available for this order?" : "Which order is selected?",
    summary: attribution ? snapshot.trackingExplanation : `${snapshot.order.customerName} · ${snapshot.order.status}`,
    status: snapshot.order.trackingHealth,
    facts: attribution
      ? Object.entries(snapshot.attribution).map(([label, value]) => ({ label, value }))
      : [{ label: "Order", value: snapshot.order.number }, { label: "Status", value: snapshot.order.status },
        { label: "Net Profit", value: snapshot.order.profit === null ? "Not available" : String(snapshot.order.profit) }],
    evidence: [snapshot.trackingExplanation],
    relationships: [{ type: "Order", id: snapshot.order.id, label: snapshot.order.number }],
  };
}


/** Only called for a purchase with an exact retained relationship to this Order. */
export function purchaseEvidenceDrawer(snapshot: OrderWorkspaceSnapshot, event: OrderTimelineEvent, id: string): OrderDrawerRecord {
  const value = (v: unknown) => v === null || v === undefined || v === "" ? "Unavailable" : String(v);
  const money = (v: unknown, currency: string | null | undefined) => `${formatObservedMoney(v, currency || null)}${currency ? ` ${currency}` : ""}`;
  return {
    id, mode: "journey", title: "Purchase Evidence", question: "Which retained evidence supports this purchase?",
    summary: "Source-backed purchase evidence from the authorized Order snapshot.", status: event.status,
    facts: [
      {label: "Canonical Order", value: value(snapshot.canonicalOrderId)},
      {label: "Canonical Journey", value: value(snapshot.canonicalJourneyId)},
      {label: "Provider Order", value: snapshot.order.id},
      {label: "Source event ID", value: event.id},
      {label: "Acquisition", value: value(event.purchaseEvidence?.acquisition)},
      {label: "Profit", value: "Unavailable"},
      {label: "Provider", value: value(event.purchaseEvidence?.provider)},
      {label: "Observed at", value: value(event.purchaseEvidence?.observedAt)},
      {label: "Purchase amount", value: money(snapshot.order.revenue, snapshot.order.currency)},
      {label: "Payment reference", value: value(snapshot.observedReferences?.payment)},
      {label: "Transaction", value: value(snapshot.observedReferences?.transaction)},
      {label: "Source evidence", value: value(snapshot.observedReferences?.evidence)},
      ...(snapshot.observedLines || []).flatMap((line, index) => [
        {label: `Product ${index + 1}`, value: value(line.name)},
        {label: `SKU ${index + 1}`, value: value(line.sku)},
        {label: `Product / variant ${index + 1}`, value: `${value(line.providerProductId)} / ${value(line.providerVariantId)}`},
        {label: `Quantity ${index + 1}`, value: value(line.quantity)},
        {label: `Unit price ${index + 1}`, value: money(line.unitAmount, line.currency)},
        {label: `Line evidence ${index + 1}`, value: value(line.evidenceId)},
      ]),
    ],
    evidence: [event.confidence, ...event.evidence], relationships: event.relationships,
    links: [
      ...(snapshot.canonicalJourneyId && snapshot.order.customerId ? [{label: "Open canonical Journey", href: `/customers?v=1&customer_id=${encodeURIComponent(snapshot.order.customerId)}&journey_id=${encodeURIComponent(snapshot.canonicalJourneyId)}&focus=journey`}] : []),
      ...(snapshot.relatedOrders || []).filter(order => order.id && order.evidence).map(order => ({label: `Open related Order ${order.number}`, href: `/orders?v=1&order_id=${encodeURIComponent(order.id)}`})),
    ],
  };
}
