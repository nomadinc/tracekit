import type { Next29WebhookIdempotencyStore, Next29WebhookScope } from "./webhook.ts";

export type CommerceWebhookReceiptClient = {
  reserveReceipt(input: Next29WebhookScope & {
    provider: "next29";
    providerEventId: string;
    eventType: string;
    apiVersion: string;
  }): Promise<{ accepted: boolean }>;
  completeReceipt(input: Next29WebhookScope & { provider: "next29"; providerEventId: string }): Promise<void>;
  failReceipt(input: Next29WebhookScope & { provider: "next29"; providerEventId: string; error: string }): Promise<void>;
};

export function createNext29WebhookIdempotency(client: CommerceWebhookReceiptClient): Next29WebhookIdempotencyStore {
  return {
    reserve(input) {
      return client.reserveReceipt({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        provider: "next29",
        providerEventId: input.eventId,
        eventType: input.eventType,
        apiVersion: input.apiVersion,
      });
    },
    complete(input) {
      return client.completeReceipt({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        provider: "next29",
        providerEventId: input.eventId,
      });
    },
    fail(input) {
      return client.failReceipt({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        provider: "next29",
        providerEventId: input.eventId,
        error: redact(input.error),
      });
    },
  };
}

export function next29WebhookReceiptInsert(input: Next29WebhookScope & {
  eventId: string;
  eventType: string;
  apiVersion: string;
}) {
  return {
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    provider: "next29",
    provider_event_id: input.eventId,
    event_type: input.eventType,
    api_version: input.apiVersion,
    status: "reserved",
    delivery_count: 1,
    metadata: {},
  };
}

function redact(value: unknown) {
  return String(value ?? "unknown error").replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500);
}
