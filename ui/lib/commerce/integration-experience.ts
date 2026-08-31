export type CapabilityState = "supported" | "limited" | "embedded" | "webhook_only" | "unavailable" | "unknown";
export type SafeCapability = { name: string; state: CapabilityState; reason: string };
export type SafeCredentialHealth = { status: "active" | "revoked" | "missing"; createdAt: string | null; rotatedAt: string | null; version: number | null };
export type SyncFrequency = "hourly" | "30_minutes" | "15_minutes" | "5_minutes" | "manual";
export type SafeConnectionSummary = { id: string; provider: string; displayName: string; environment: string; status: string; organizationName: string; providerAccountLabel: string | null; lastVerifiedAt: string | null; lastSyncAt: string | null; syncFrequency: SyncFrequency; nextSyncAt: string | null; capabilities: SafeCapability[] };
export type SafeSyncRun = { id: string; connectionId: string; connectionName: string; provider: string; mode: string; resource: string; status: string; startedAt: string | null; completedAt: string | null; pagesCompleted: number; recordsSeen: number; recordsCreated: number; recordsUpdated: number; recordsUnchanged: number; recordsFailed: number; warnings: number; providerRequests: number; stoppingReason: string | null; freshnessResult: string | null; leaseActive: boolean; heartbeatAt: string | null; errorSummary: string | null };
export type SafeContinuousFreshness = { status: "unknown"|"current"|"stale"|"failed"|"degraded"; lastAttemptedAt:string|null; lastSuccessfulAt:string|null; lastProviderObservationAt:string|null; lastNormalizedRecordAt:string|null; latestProviderTransactionAt:string|null; providerTotal:number|null; lastDeepReconciliationAt:string|null; stoppingReason:string|null; attributionSourceState:"available"|"unavailable"|"partial"; deepReconciliationRequired:boolean };
export type SafeReadinessGate = { id: string; label: string; status: "passed" | "blocked" | "pending" | "not_required"; explanation: string; evidenceAt: string | null };
export type SafeDiagnostics = { latestRequestStatus: string | null; latencyMs: number | null; providerRequestIdPresent: boolean; retryCount: number; rateLimitRemaining: number | null; rateLimitReset: string | null; sanitizedError: string | null; activeRun: boolean; leaseOwnerPresent: boolean; heartbeatAge: string | null; stalled: boolean; pendingCheckpoints: number; failedCheckpoints: number; evidenceReferences: number; missingEvidenceReferences: number; hashState: "verified" | "pending" | "unavailable" };
export type SafeProductionReadiness={schedulerState:"disabled"|"ready"|"enabled"|"paused";connectionPaused:boolean;quotaMinimumRemaining:number|null;deepRequestBudget:number|null;blockers:string[]};
export type SafeTkidOrigin={id:string;sourceId:string;origin:string;role:"frontend"|"checkout_return"|"oto"|"confirmation"|"multi_purpose";status:"pending"|"verified"|"active"|"retired";verificationState:string;verifiedAt:string|null;retiredAt:string|null;lastObservedAt:string|null;acceptedEvents:number;rejectedEvents:number};
export type SafeTkidOriginRegistry={sourceId:string|null;sourceState:string;origins:SafeTkidOrigin[];blockers:string[];canManage:boolean};
export type ConnectionExperience = SafeConnectionSummary & { credential: SafeCredentialHealth; readiness: SafeReadinessGate[]; productionReadiness:SafeProductionReadiness; tkidOrigins:SafeTkidOriginRegistry; diagnostics: SafeDiagnostics; freshness:SafeContinuousFreshness; syncRuns: SafeSyncRun[]; canManage: boolean };

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

export const EVERFLOW_CAPABILITIES: SafeCapability[] = [
  { name: "Affiliates", state: "supported", reason: "Connection-scoped Network API ingestion implemented." },
  { name: "Advertisers", state: "supported", reason: "Connection-scoped advertiser reference ingestion implemented." },
  { name: "Offers", state: "supported", reason: "Offer ingestion preserves advertiser ownership and source identity." },
  { name: "Conversions", state: "supported", reason: "Bounded incremental conversion ingestion and checkpoints implemented." },
  { name: "Transaction IDs", state: "supported", reason: "Direct Everflow transaction identity can resolve to canonical orders." },
  { name: "Email fallback", state: "limited", reason: "Fallback requires guarded time and amount evidence and remains lower confidence." },
  { name: "Events / reversals", state: "limited", reason: "Conversion event evidence is ingested; full lifecycle handling remains later work." },
  { name: "Clicks", state: "unavailable", reason: "Dedicated click ingestion is not implemented yet." },
];

export const SHOPIFY_CAPABILITIES: SafeCapability[] = [
  { name: "Shop identity", state: "supported", reason: "Bounded Admin GraphQL verification is implemented." },
  { name: "Products / variants", state: "supported", reason: "Incremental read and canonical normalization are implemented." },
  { name: "Customers", state: "supported", reason: "Incremental customer reads preserve Shopify provider identity." },
  { name: "Orders / line items", state: "supported", reason: "Incremental order reads and evidence-backed line normalization are implemented." },
  { name: "Refunds", state: "supported", reason: "Refund evidence and append-only financial events are implemented." },
  { name: "Scheduled sync", state: "unavailable", reason: "M4 live smoke remains bounded and manual; broad scheduling is not enabled yet." },
];

export const PROVIDER_CATALOG = [
  { provider: "commas", name: "Commas", availability: "available" },
  { provider: "everflow", name: "Everflow", availability: "available" },
  { provider: "shopify", name: "Shopify", availability: "available" },
  { provider: "checkout_champ", name: "Checkout Champ", availability: "coming_soon" },
  { provider: "woocommerce", name: "WooCommerce", availability: "coming_soon" },
  { provider: "next29", name: "Next29", availability: "coming_soon" },
  { provider: "sticky_io", name: "Sticky.io", availability: "coming_soon" },
] as const;