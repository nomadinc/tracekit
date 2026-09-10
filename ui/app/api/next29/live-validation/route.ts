import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runStoredNext29LiveValidation } from "@/lib/commerce/next29-live-validation";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ ok: false, code: "request_verification_failed", message: "Request verification failed.", requestId }, { status: 403, headers: responseHeaders(requestId) });
    }
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.activeAccount) {
      return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable.", requestId }, { status: 404, headers: responseHeaders(requestId) });
    }
    const body = await request.json().catch(() => null) as { connectionId?: unknown } | null;
    const connectionId = String(body?.connectionId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(connectionId)) {
      return NextResponse.json({ ok: false, code: "invalid_request", message: "Choose a valid 29Next connection.", requestId }, { status: 400, headers: responseHeaders(requestId) });
    }

    const report = await runStoredNext29LiveValidation({ session: resolution.session, connectionId });
    return NextResponse.json({
      ok: true,
      status: "completed",
      message: "29Next M12 bounded live validation completed.",
      requestId,
      validation: report,
    }, { status: 200, headers: responseHeaders(requestId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "29Next live validation failed.";
    const safe = message.replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 300);
    console.error("next29_m12_live_validation_failed", { requestId, error: safe });
    const configuration = /TRACEKIT_NEXT29_LIVE_VALIDATION_ENV|production UI runtime|schedules|sync is active|exactly one active provider account/i.test(safe);
    return NextResponse.json({
      ok: false,
      code: configuration ? "live_validation_not_permitted" : "live_validation_failed",
      message: safe,
      requestId,
      retryable: !configuration,
    }, { status: configuration ? 409 : 502, headers: responseHeaders(requestId) });
  }
}
