import type { Next29EvidenceEnvelope, Next29EvidenceSink } from "./types.ts";

const encoder = new TextEncoder();

export type Next29EvidenceScope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
};

export async function persistNext29Evidence(
  sink: Next29EvidenceSink,
  scope: Next29EvidenceScope,
  envelope: Next29EvidenceEnvelope,
) {
  validateScope(scope);
  if (!envelope.sourceObjectId.trim()) throw new Error("29Next evidence source object ID is required.");
  const observedAt = new Date(envelope.observedAt);
  if (!Number.isFinite(observedAt.getTime())) throw new Error("29Next evidence observedAt must be an ISO-compatible timestamp.");

  const payload = encoder.encode(JSON.stringify(envelope));
  return sink.putImmutable({
    organizationId: scope.organizationId,
    connectionId: scope.connectionId,
    providerAccountId: scope.providerAccountId,
    sourceObjectType: `next29_${envelope.resource}`,
    sourceObjectId: envelope.sourceObjectId,
    observedAt: observedAt.toISOString(),
    payload,
    contentType: "application/json",
  });
}

export function next29OrderEvidence(args: { apiVersion: string; orderNumber: string; observedAt?: string; payload: unknown }): Next29EvidenceEnvelope {
  return { provider: "next29", apiVersion: args.apiVersion, resource: "order", sourceObjectId: args.orderNumber, observedAt: args.observedAt ?? new Date().toISOString(), payload: args.payload };
}

export function next29SubscriptionEvidence(args: { apiVersion: string; subscriptionId: string; observedAt?: string; payload: unknown }): Next29EvidenceEnvelope {
  return { provider: "next29", apiVersion: args.apiVersion, resource: "subscription", sourceObjectId: args.subscriptionId, observedAt: args.observedAt ?? new Date().toISOString(), payload: args.payload };
}

export function next29DisputeEvidence(args: { apiVersion: string; disputeId: string; observedAt?: string; payload: unknown }): Next29EvidenceEnvelope {
  return { provider: "next29", apiVersion: args.apiVersion, resource: "dispute", sourceObjectId: args.disputeId, observedAt: args.observedAt ?? new Date().toISOString(), payload: args.payload };
}

function validateScope(scope: Next29EvidenceScope) {
  for (const [name, value] of Object.entries(scope)) {
    if (!String(value ?? "").trim()) throw new Error(`29Next evidence ${name} is required.`);
  }
}
