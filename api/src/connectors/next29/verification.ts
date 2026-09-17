import { Next29Client, type Next29ClientDependencies } from "./client.ts";
import type { Next29ClientConfig } from "./types.ts";

export const NEXT29_CONNECTION_CAPABILITIES = [
  "orders.read",
  "subscriptions.read",
  "disputes.read",
  "webhooks.signed",
  "cursor_pagination",
  "versioned_admin_api",
] as const;

export type Next29ConnectionCapability = typeof NEXT29_CONNECTION_CAPABILITIES[number];

export type Next29VerificationResult = {
  status: "connected";
  apiVersion: string;
  capabilities: readonly Next29ConnectionCapability[];
  providerRequestIdPresent: boolean;
  rateLimitObserved: boolean;
  resourceChecks: {
    orders: true;
    subscriptions: true;
    disputes: true;
  };
};

/**
 * Performs bounded read-only Admin API requests against every resource that the
 * TraceKit 29Next runtime depends on. A successful result proves authentication
 * plus orders:read, subscriptions:read, and disputes:read without returning or
 * logging provider payload values. Webhook signing remains a local capability;
 * this function never registers or mutates a webhook.
 */
export async function verifyNext29ReadOnlyConnection(
  config: Next29ClientConfig,
  dependencies: Next29ClientDependencies = {},
): Promise<Next29VerificationResult> {
  const client = new Next29Client({ ...config, maxAttempts: Math.min(config.maxAttempts ?? 2, 2) }, dependencies);
  const [orders, subscriptions, disputes] = await Promise.all([
    client.listOrders(),
    client.listSubscriptions(),
    client.listDisputes(),
  ]);
  const pages = [orders, subscriptions, disputes];
  return {
    status: "connected",
    apiVersion: client.apiVersion,
    capabilities: NEXT29_CONNECTION_CAPABILITIES,
    providerRequestIdPresent: pages.some((page) => Boolean(page.providerRequestId)),
    rateLimitObserved: pages.some((page) => page.rateLimit.limit !== null || page.rateLimit.remaining !== null),
    resourceChecks: { orders: true, subscriptions: true, disputes: true },
  };
}
