import type { TraceKitSessionContext } from "./persistent-types";

// Raw provider payloads are never browser read models. Authorize details on the
// server before serialization; hiding fields in a React component is insufficient.
export function projectCoreCustomerRead(body: unknown, session: TraceKitSessionContext): unknown {
  const sensitive = session.effectivePermissions.includes("customers.view_sensitive_data");
  const financial = session.effectivePermissions.includes("financials.view") && session.effectivePermissions.includes("orders.view_financials");
  const privateContainers = /^(raw|raw_json|payload|technical|technical_evidence|metadata|identifiers|primary_identifier|identity_events|match_reason)$/i;
  const contact = /email|phone|address|ip_address|originalUrl|referrer|destinationUrl|queryParameters/i;
  const money = /amount|revenue|profit|commission|payout|fee|cost|subtotal|receipt_total|shipping_charged|tax_collected|discount|price|balance/i;
  // Observed commerce is a customer read capability, distinct from financial
  // authority. This closed list excludes costs, profit and attribution credits.
  const commerceFields = new Set(["amount", "gross_amount", "product_subtotal", "tax_amount", "shipping_amount", "unit_amount", "lifetime_revenue"]);
  function visit(value: unknown, commerce: boolean | "summary" = false): unknown {
    if (Array.isArray(value)) return value.map(child => visit(child, commerce));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key, child]) => !privateContainers.test(key) && (sensitive || !contact.test(key) || child === "••••") && (financial || !money.test(key) || (commerce && commerceFields.has(key) && (commerce !== "summary" || key === "lifetime_revenue")))).map(([key, child]) => [key, visit(child, key === "summary" ? "summary" : ["orders", "order", "order_lines", "commerce"].includes(key))]));
    if (typeof value === "string") {
      let result = sensitive ? value : value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "••••");
      if (!financial) result = result.replace(/[$€£¥]\s*-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:USD|EUR|GBP|CAD|AUD|JPY)\b/g, "Restricted");
      return result;
    }
    return value;
  }
  return visit(body);
}
