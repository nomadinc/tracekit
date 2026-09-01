import type { Next29Client } from "./client.ts";
import { normalizeNext29Dispute, type Next29CanonicalDispute } from "./dispute.ts";
import type { Next29WebhookDispatchInput } from "./webhook.ts";

export type Next29DisputeWebhookProcessor = (input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  eventId: string;
  eventType: string;
  normalized: Next29CanonicalDispute;
  rawDispute: unknown;
  webhookEvidence: { storageReference: string; payloadHash: string; byteSize: number };
}) => Promise<void>;

export function createNext29DisputeWebhookHandler(args: {
  client: Pick<Next29Client, "getDispute">;
  process: Next29DisputeWebhookProcessor;
}) {
  return async function handle(input: Next29WebhookDispatchInput) {
    if (input.object !== "dispute") throw new Error("29Next dispute webhook adapter requires a dispute event.");
    const providerDisputeId = requiredId(input.data.id, "webhook dispute id");
    const detail = await args.client.getDispute(providerDisputeId);
    const normalized = normalizeNext29Dispute(detail.item);
    if (normalized.providerDisputeId !== providerDisputeId) throw new Error("29Next webhook dispute identity does not match current dispute detail.");
    await args.process({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      providerAccountId: input.providerAccountId,
      eventId: input.eventId,
      eventType: input.eventType,
      normalized,
      rawDispute: detail.item,
      webhookEvidence: input.evidence,
    });
  };
}

function requiredId(value: unknown, label: string) { const result = String(value ?? "").trim(); if (!result || result.length > 200) throw new Error(`29Next ${label} is required.`); return result; }
