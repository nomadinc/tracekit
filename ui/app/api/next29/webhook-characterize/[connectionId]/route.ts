import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { characterizeNext29WebhookSignature } from "../../../../../../api/src/connectors/next29/activation-readiness.ts";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256_000;

function responseHeaders(requestId: string) {
  return { "x-tracekit-request-id": requestId, "cache-control": "no-store" };
}

function failure(requestId: string, status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message, requestId }, { status, headers: responseHeaders(requestId) });
}

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const requestId = randomUUID();
  try {
    const environment = String(process.env.TRACEKIT_NEXT29_WEBHOOK_CHARACTERIZATION_ENV || "").trim().toLowerCase();
    const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    if (!new Set(["preview", "staging"]).has(environment) || vercelEnvironment === "production") {
      console.warn("next29_m13_webhook_characterization_gate", {
        requestId,
        gate: "environment",
        configuredEnvironment: environment || "unset",
        vercelEnvironment: vercelEnvironment || "unset",
      });
      return failure(requestId, 404, "characterization_environment_unavailable", "29Next webhook characterization is unavailable in this environment.");
    }

    const signingSecret = String(process.env.TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET || "").trim();
    if (signingSecret.length < 8) {
      return failure(requestId, 503, "characterization_unavailable", "29Next webhook characterization is not configured.");
    }

    const { connectionId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
      console.warn("next29_m13_webhook_characterization_gate", { requestId, gate: "connection_id_format" });
      return failure(requestId, 404, "connection_unavailable", "The requested 29Next connection is unavailable.");
    }

    const signature = String(request.headers.get("x-29next-signature") || "").trim();
    if (!signature) return failure(requestId, 400, "signature_missing", "29Next signature header is required.");

    const raw = new Uint8Array(await request.arrayBuffer());
    if (!raw.length || raw.length > MAX_BODY_BYTES) return failure(requestId, 413, "invalid_payload_size", "Webhook payload size is outside the characterization limit.");

    const proof = await characterizeNext29WebhookSignature({ rawBody: raw, signature, signingSecret });
    console.info("next29_m13_webhook_characterization", {
      requestId,
      connectionId,
      verified: proof.verified,
      serialization: proof.serialization,
      byteSize: raw.byteLength,
    });

    // Diagnostic-only endpoint: do not query commerce persistence, persist provider
    // payloads, reserve webhook receipts, invoke canonical handlers, or activate schedules.
    if (!proof.verified) return failure(requestId, 401, "signature_unverified", "29Next webhook signature could not be characterized.");
    return NextResponse.json({ ok: true, verified: true, serialization: proof.serialization, requestId }, { status: 200, headers: responseHeaders(requestId) });
  } catch (error) {
    console.error("next29_m13_webhook_characterization_failed", { requestId, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" });
    return failure(requestId, 500, "characterization_failed", "29Next webhook characterization failed.");
  }
}
