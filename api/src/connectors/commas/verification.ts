import { CommasClient, type CommasClientDependencies } from "./client.ts";
import type { CommasClientConfig } from "./types.ts";

export type CommasVerificationResult = {
  status: "connected";
  capabilities: readonly ["customers.read", "transactions.read"];
  providerRequestIdPresent: boolean;
  rateLimitObserved: boolean;
};

/** One bounded GET; returns structural capability state, never provider values. */
export async function verifyCommasReadOnlyConnection(
  config: CommasClientConfig,
  dependencies: CommasClientDependencies = {},
): Promise<CommasVerificationResult> {
  const client = new CommasClient({ ...config, maxAttempts: Math.min(config.maxAttempts ?? 2, 2) }, dependencies);
  const page = await client.listCustomers({ page: 1, perPage: 1 });
  return {
    status: "connected",
    capabilities: ["customers.read", "transactions.read"],
    providerRequestIdPresent: Boolean(page.providerRequestId),
    rateLimitObserved: page.rateLimit.limit !== null || page.rateLimit.remaining !== null,
  };
}
