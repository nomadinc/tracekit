import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runNext29WebhookCanary } from "@/lib/commerce/next29-webhook-canary";
import { resolveNext29WebhookSigningSecret } from "@/lib/commerce/next29-webhook-signing-secret";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256_000;

function headers(requestId: string) {
  return { "x-tracekit-request-id": requestId, "cache-control": "no-store" };
}

function fail(requestId: string, status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message, requestId }, { status, headers: headers(requestId) });
}

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  try {
    const configured = String(process.env.TRACEKIT_NEXT29_WEBHOOK_RUNTIME_ENV || "").trim().toLowerCase();
    const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();

    // M14.1A is deliberately inert in production. M14.1B must provide
    // connection-scoped encrypted signing-secret storage before this guard changes.
    if (configured !== "staging" || vercelEnvironment === "production") {
      return fail(requestId, 404, "webhook_runtime_unavailable", "29Next webhook runtime is unavailable in this environment.");
    }

    const signature = String(request.headers.get("x-29next-signature") || "").trim();
    if (!signature) return fail(requestId, 400, "signature_missing", "29Next signature header is required.");

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (!rawBody.length || rawBody.length > MAX_BODY_BYTES) {
      return fail(requestId, 413, "invalid_payload_size", "Webhook payload size is outside the runtime limit.");
    }

    const { connectionId } = await context.params;
    const signingSecret = await resolveNext29WebhookSigningSecret({ connectionId });

    // M14.1A intentionally reuses the M13-proven order.created processor. The
    // permanent route contract is now isolated; M14.1B will extract the remaining
    // canary environment guard while replacing secret storage.
    const result = await runNext29WebhookCanary({ connectionId, rawBody, signature, signingSecret });

    console.info("next29_webhook_runtime", {
      requestId,
      connectionId,
      eventId: result.eventId,
      eventType: "order.created",
      duplicate: result.duplicate,
      orderNumberPresent: Boolean(result.orderNumber),
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { ok: true, accepted: true, duplicate: result.duplicate, eventId: result.eventId, requestId },
      { status: 200, headers: headers(requestId) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const persistenceStatus = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;
    const persistenceCode = error && typeof error === "object" && "databaseCode" in error
      ? String((error as { databaseCode?: unknown }).databaseCode ?? "").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80) || null
      : null;

    console.error("next29_webhook_runtime_failed", {
      requestId,
      error: message.replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 300),
      persistenceStatus,
      persistenceCode,
      durationMs: Date.now() - startedAt,
    });

    if (/signature verification failed/i.test(message)) return fail(requestId, 401, "signature_unverified", "29Next webhook signature verification failed.");
    if (/accepts only order\.created/i.test(message)) return fail(requestId, 422, "event_not_enabled", "This webhook runtime currently accepts only order.created events.");
    if (/unavailable|requires exactly one active provider account|schedules to remain disabled|another commerce sync/i.test(message)) {
      return fail(requestId, 409, "webhook_runtime_gate_failed", "29Next webhook runtime safety gate failed.");
    }
    return fail(requestId, 500, "webhook_runtime_failed", "29Next webhook runtime failed.");
  }
}
