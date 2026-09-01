import { Next29Client, type Next29ClientDependencies } from "./client.ts";
import type { Next29ClientConfig } from "./types.ts";

export type Next29VerificationResult = {
  status: "connected";
  apiVersion: string;
  capabilities: readonly ["orders.read", "cursor_pagination", "versioned_admin_api"];
  providerRequestIdPresent: boolean;
  rateLimitObserved: boolean;
};

/**
 * Performs one read-only Admin API request against orders.
 * A successful result proves authentication plus the orders:read scope without
 * returning or logging any provider payload values.
 */
export async function verifyNext29ReadOnlyConnection(
  config: Next29ClientConfig,
  dependencies: Next29ClientDependencies = {},
): Promise<Next29VerificationResult> {
  const client = new Next29Client({ ...config, maxAttempts: Math.min(config.maxAttempts ?? 2, 2) }, dependencies);
  const page = await client.listOrders();
  return {
    status: "connected",
    apiVersion: client.apiVersion,
    capabilities: ["orders.read", "cursor_pagination", "versioned_admin_api"],
    providerRequestIdPresent: Boolean(page.providerRequestId),
    rateLimitObserved: page.rateLimit.limit !== null || page.rateLimit.remaining !== null,
  };
}
