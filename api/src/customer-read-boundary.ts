// Browser SDK ingestion and provider webhooks remain on their existing contracts.
// These private reads are reached through the authenticated UI/MCP server proxy.
const privateReadPaths = [
  "/v1/customers", "/v1/customer-orders", "/v1/events", "/v1/entities",
  "/v1/home", "/v1/health", "/v1/search", "/v1/executive-dashboard",
  "/v1/platform-orders", "/v1/order-groups", "/v1/profit", "/v1/refunds/analysis", "/v1/chargebacks",
  "/v1/kpis", "/v1/revenue-spend", "/v1/product-costs", "/v1/product-catalog",
  "/v1/operations/summary", "/v1/financial-import-monitor", "/v1/financial-reconciliation",
];
export function isProtectedCustomerReadPath(path: string) {
  return privateReadPaths.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
