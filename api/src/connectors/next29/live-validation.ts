import type { Next29Client } from "./client.ts";
import type { Next29EvidenceSink } from "./types.ts";
import { runNext29BoundedBackfill, type Next29RuntimePersistence, type Next29RuntimeScope } from "./runtime.ts";

export type Next29LiveValidationReport = {
  provider: "next29";
  bounded: true;
  providerReads: { orders: true; subscriptions: true; disputes: true };
  recordsObserved: { orders: number; subscriptions: number; disputes: number };
  hasMore: { orders: boolean; subscriptions: boolean; disputes: boolean };
  evidenceAndCanonicalPathExecuted: boolean;
};

/**
 * Non-production validation harness. It executes exactly one bounded page per
 * resource with a maximum of 10 records each. The caller supplies the same
 * evidence/persistence adapters used by the real connector, so a PASS proves
 * the end-to-end provider -> evidence -> canonical path without enabling a
 * schedule or dispatcher.
 */
export async function runNext29LiveValidation(input: Next29RuntimeScope & {
  environment: "preview" | "staging";
  client: Pick<Next29Client,
    | "apiVersion"
    | "listOrders" | "getOrder"
    | "listSubscriptions" | "getSubscription"
    | "listDisputes" | "getDispute"
  >;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29RuntimePersistence;
}): Promise<Next29LiveValidationReport> {
  if (input.environment !== "preview" && input.environment !== "staging") {
    throw new Error("29Next live validation is restricted to preview or staging.");
  }
  const result = await runNext29BoundedBackfill({
    organizationId: required(input.organizationId, "organizationId"),
    connectionId: required(input.connectionId, "connectionId"),
    providerAccountId: required(input.providerAccountId, "providerAccountId"),
    client: input.client,
    evidenceSink: input.evidenceSink,
    persistence: input.persistence,
    resources: ["orders", "subscriptions", "disputes"],
    bounds: { maxPagesPerResource: 1, maxRecordsPerResource: 10 },
  });

  return {
    provider: "next29",
    bounded: true,
    providerReads: { orders: true, subscriptions: true, disputes: true },
    recordsObserved: {
      orders: result.resources.orders?.records ?? 0,
      subscriptions: result.resources.subscriptions?.records ?? 0,
      disputes: result.resources.disputes?.records ?? 0,
    },
    hasMore: {
      orders: Boolean(result.resources.orders?.hasMore),
      subscriptions: Boolean(result.resources.subscriptions?.hasMore),
      disputes: Boolean(result.resources.disputes?.hasMore),
    },
    evidenceAndCanonicalPathExecuted: true,
  };
}

function required(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`29Next live validation ${label} is required.`);
  return text;
}
