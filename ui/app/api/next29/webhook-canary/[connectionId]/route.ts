import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runNext29WebhookCanary } from "@/lib/commerce/next29-webhook-canary";

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
  try {
    const configured = String(process.env.TRACEKIT_NEXT29_WEBHOOK_CANARY_ENV || "").trim().toLowerCase();
    const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    if (!new Set(["preview", "staging"]).has(configured) || vercelEnvironment === "production") {
      return fail(requestId, 404, "canary_unavailable", "29Next webhook canary is unavailable in this environment.");
    }

    const signingSecret = String(process.env.TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET || "").trim();
    if (signingSecret.length < 8) return fail(requestId, 503, "canary_unconfigured", "29Next webhook canary is not configured.");

    const signature = String(request.headers.get("x-29next-signature") || "").trim();
    if (!signature) return fail(requestId, 400, "signature_missing", "29Next signature header is required.");

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (!rawBody.length || rawBody.length > MAX_BODY_BYTES) return fail(requestId, 413, "invalid_payload_size", "Webhook payload size is outside the canary limit.");

    const { connectionId } = await context.params;
    const result = await runNext29WebhookCanary({ connectionId, rawBody, signature, signingSecret });
    console.info("next29_m13_webhook_canary", {
      requestId,
      connectionId,
      eventId: result.eventId,
      duplicate: result.duplicate,
      orderNumberPresent: Boolean(result.orderNumber),
    });
    return NextResponse.json({ ok: true, accepted: true, duplicate: result.duplicate, eventId: result.eventId, requestId }, { status: 200, headers: headers(requestId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("next29_m13_webhook_canary_failed", { requestId, error: message.replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 300) });
    if (/signature verification failed/i.test(message)) return fail(requestId, 401, "signature_unverified", "29Next webhook signature verification failed.");
    if (/accepts only order\.created/i.test(message)) return fail(requestId, 422, "event_not_enabled", "This M13 canary accepts only order.created events.");
    if (/unavailable|requires exactly one active provider account|schedules to remain disabled|another commerce sync/i.test(message)) return fail(requestId, 409, "canary_gate_failed", "29Next webhook canary safety gate failed.");
    return fail(requestId, 500, "canary_failed", "29Next webhook canary failed.");
  }
}
