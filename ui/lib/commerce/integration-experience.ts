export type CapabilityState = "supported" | "limited" | "embedded" | "webhook_only" | "unavailable" | "unknown";
export type SafeCapability = { name: string; state: CapabilityState; reason: string };
export type SafeCredentialHealth = { status: "active" | "revoked" | "missing"; createdAt: string | null; rotatedAt: string | null; version: number | null };
export type SafeConnectionSummary = { id: string; provider: string; displayName: string; environment: string; status: string; organizationName: string; providerAccountLabel: string | null; lastVerifiedAt: string | null; lastSyncAt: string | null; capabilities: SafeCapability[] };
export type SafeSyncRun = { id: string; connectionId: string; connectionName: string; provider: string; mode: string; resource: string; status: string; startedAt: string | null; completedAt: string | null; pagesCompleted: number; recordsSeen: number; recordsCreated: number; recordsUpdated: number; recordsFailed: number; warnings: number; leaseActive: boolean; heartbeatAt: string | null; errorSummary: string | null };
export type SafeReadinessGate = { id: string; label: string; status: "passed" | "blocked" | "pending" | "not_required"; explanation: string; evidenceAt: string | null };
export type SafeDiagnostics = { latestRequestStatus: string | null; latencyMs: number | null; providerRequestIdPresent: boolean; retryCount: number; rateLimitRemaining: number | null; rateLimitReset: string | null; sanitizedError: string | null; activeRun: boolean; leaseOwnerPresent: boolean; heartbeatAge: string | null; stalled: boolean; pendingCheckpoints: number; failedCheckpoints: number; evidenceReferences: number; missingEvidenceReferences: number; hashState: "verified" | "pending" | "unavailable" };
export type ConnectionExperience = SafeConnectionSummary & { credential: SafeCredentialHealth; readiness: SafeReadinessGate[]; diagnostics: SafeDiagnostics; syncRuns: SafeSyncRun[]; canManage: boolean };

export const COMMAS_CAPABILITIES: SafeCapability[] = [
  { name: "Customers", state: "supported", reason: "Bounded list access verified." },
  { name: "Transactions", state: "supported", reason: "List and detail access verified." },
  { name: "Transaction Detail", state: "supported", reason: "Verified on the main account." },
  { name: "Pagination", state: "supported", reason: "Page-number traversal verified." },
  { name: "Products", state: "limited", reason: "The Product collection returns provider HTTP 500; Products are observable in Transactions." },
  { name: "Refunds", state: "embedded", reason: "Embedded in Transactions; the live Refund schema still requires verification." },
  { name: "Chargebacks / Disputes", state: "webhook_only", reason: "No polling endpoint; dispute.created and dispute.updated are documented." },
  { name: "Attribution identifiers", state: "unavailable", reason: "Not observed in bounded Transaction samples." },
];

export const PROVIDER_CATALOG = [
  { provider: "commas", name: "Commas", availability: "available" },
  { provider: "shopify", name: "Shopify", availability: "coming_soon" },
  { provider: "checkout_champ", name: "Checkout Champ", availability: "coming_soon" },
  { provider: "woocommerce", name: "WooCommerce", availability: "coming_soon" },
  { provider: "next29", name: "Next29", availability: "coming_soon" },
  { provider: "sticky_io", name: "Sticky.io", availability: "coming_soon" },
] as const;
