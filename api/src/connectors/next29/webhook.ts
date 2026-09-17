import type { Next29EvidenceSink } from "./types.ts";

const encoder = new TextEncoder();
const SUPPORTED_EVENT_TYPES = new Set([
  "order.created",
  "order.updated",
  "transaction.created",
  "transaction.updated",
  "subscription.created",
  "subscription.updated",
  "dispute.created",
  "dispute.updated",
]);

export type Next29WebhookScope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
};

export type Next29WebhookEnvelope = {
  object: string;
  data: Record<string, unknown>;
  event_id: string;
  event_type: string;
  webhook: Record<string, unknown>;
  api_version: string;
};

export type Next29WebhookIdempotencyStore = {
  reserve(input: Next29WebhookScope & {
    eventId: string;
    eventType: string;
    apiVersion: string;
  }): Promise<{ accepted: boolean }>;
  complete(input: Next29WebhookScope & { eventId: string }): Promise<void>;
  fail(input: Next29WebhookScope & { eventId: string; error: string }): Promise<void>;
};

export type Next29WebhookHandlers = {
  order?: (input: Next29WebhookDispatchInput) => Promise<void>;
  transaction?: (input: Next29WebhookDispatchInput) => Promise<void>;
  subscription?: (input: Next29WebhookDispatchInput) => Promise<void>;
  dispute?: (input: Next29WebhookDispatchInput) => Promise<void>;
};

export type Next29WebhookDispatchInput = Next29WebhookScope & {
  eventId: string;
  eventType: string;
  apiVersion: string;
  object: string;
  data: Record<string, unknown>;
  evidence: { storageReference: string; payloadHash: string; byteSize: number };
};

export type HandleNext29WebhookArgs = Next29WebhookScope & {
  rawBody: Uint8Array;
  signature: string | null | undefined;
  signingSecret: string;
  evidenceSink: Next29EvidenceSink;
  idempotency: Next29WebhookIdempotencyStore;
  handlers: Next29WebhookHandlers;
  observedAt?: string;
};

export type Next29WebhookResult = {
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  eventType: string;
  routedObject: "order" | "transaction" | "subscription" | "dispute";
};

export async function verifyNext29WebhookSignature(args: {
  rawBody: Uint8Array;
  signature: string | null | undefined;
  signingSecret: string;
}): Promise<boolean> {
  const signature = normalizeHex(args.signature);
  const secret = String(args.signingSecret || "");
  if (!signature || !secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, args.rawBody as BufferSource));
  const expected = toHex(digest);
  return constantTimeHexEqual(expected, signature);
}

export async function handleNext29Webhook(args: HandleNext29WebhookArgs): Promise<Next29WebhookResult> {
  const scope = requireScope(args);
  if (!(await verifyNext29WebhookSignature(args))) throw new Error("29Next webhook signature verification failed.");

  const envelope = parseNext29Webhook(args.rawBody);
  const route = routeFor(envelope);
  const reservation = await args.idempotency.reserve({
    ...scope,
    eventId: envelope.event_id,
    eventType: envelope.event_type,
    apiVersion: envelope.api_version,
  });
  if (!reservation.accepted) {
    return { accepted: true, duplicate: true, eventId: envelope.event_id, eventType: envelope.event_type, routedObject: route };
  }

  try {
    const observedAt = normalizeTimestamp(args.observedAt) ?? new Date().toISOString();
    const evidence = await args.evidenceSink.putImmutable({
      ...scope,
      sourceObjectType: "next29_webhook",
      sourceObjectId: envelope.event_id,
      observedAt,
      payload: args.rawBody,
      contentType: "application/json",
    });

    const handler = args.handlers[route];
    if (!handler) throw new Error(`29Next webhook handler is not configured for ${route}.`);
    await handler({
      ...scope,
      eventId: envelope.event_id,
      eventType: envelope.event_type,
      apiVersion: envelope.api_version,
      object: envelope.object,
      data: envelope.data,
      evidence,
    });
    await args.idempotency.complete({ ...scope, eventId: envelope.event_id });
    return { accepted: true, duplicate: false, eventId: envelope.event_id, eventType: envelope.event_type, routedObject: route };
  } catch (error) {
    await args.idempotency.fail({ ...scope, eventId: envelope.event_id, error: safeError(error) });
    throw error;
  }
}

export function parseNext29Webhook(rawBody: Uint8Array): Next29WebhookEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new Error("29Next webhook payload is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("29Next webhook payload must be an object.");
  const source = value as Record<string, unknown>;
  const eventId = boundedText(source.event_id, 200);
  const eventType = boundedText(source.event_type, 100)?.toLowerCase() ?? null;
  const objectName = boundedText(source.object, 100)?.toLowerCase() ?? null;
  const apiVersion = boundedText(source.api_version, 50);
  const data = record(source.data);
  const webhook = record(source.webhook);
  if (!eventId || !eventType || !objectName || !apiVersion || !data || !webhook) {
    throw new Error("29Next webhook payload is missing required envelope fields.");
  }
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) throw new Error(`29Next webhook event type is not supported: ${eventType}.`);
  return { object: objectName, data, event_id: eventId, event_type: eventType, webhook, api_version: apiVersion };
}

function routeFor(envelope: Next29WebhookEnvelope): "order" | "transaction" | "subscription" | "dispute" {
  const prefix = envelope.event_type.split(".")[0];
  if (prefix !== "order" && prefix !== "transaction" && prefix !== "subscription" && prefix !== "dispute") {
    throw new Error(`29Next webhook event route is unsupported: ${envelope.event_type}.`);
  }
  if (envelope.object !== prefix) throw new Error("29Next webhook object does not match its event type.");
  return prefix;
}

function requireScope(input: Next29WebhookScope): Next29WebhookScope {
  const organizationId = boundedText(input.organizationId, 200);
  const connectionId = boundedText(input.connectionId, 200);
  const providerAccountId = boundedText(input.providerAccountId, 200);
  if (!organizationId || !connectionId || !providerAccountId) throw new Error("29Next webhook requires tenant, connection, and provider account scope.");
  return { organizationId, connectionId, providerAccountId };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function boundedText(value: unknown, max: number) { const text = String(value ?? "").trim(); return text && text.length <= max ? text : null; }
function normalizeTimestamp(value: unknown) { const text = boundedText(value, 100); if (!text) return null; const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function normalizeHex(value: unknown) { const text = String(value ?? "").trim().toLowerCase(); return /^[a-f0-9]{64}$/.test(text) ? text : null; }
function toHex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function constantTimeHexEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function safeError(error: unknown) { return (error instanceof Error ? error.message : String(error ?? "unknown error")).replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500); }
