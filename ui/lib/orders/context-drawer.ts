import type { OrderDrawerRecord, OrderWorkspaceSnapshot } from "./types";

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
