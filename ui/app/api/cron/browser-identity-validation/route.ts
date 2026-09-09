import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CONFIRMATION = "tracekit-gate3b-five-identify-events";
const RUN = "20260909_gate3b";
const FIXTURES = [1, 2, 3, 4, 5].map((caseNumber) => ({
  caseNumber,
  eventId: `browser_identity_gate3b_${RUN}_${caseNumber}`,
  tkid: `tk_attr_ae1_1788845051367_21f18dcd_${caseNumber}`,
  sessionId: `tks_attr_ae1_1788845051367_21f18dcd_${caseNumber}`,
  externalCustomerId: `tracekit_validation_identity_${RUN}_${caseNumber}`,
}));

function noStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request) {
  const expected = String(process.env.TK_SECRET_KEY || "").trim();
  const supplied = String(request.headers.get("x-tk-secret") || "").trim();
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return noStore({ ok: false, error: "not_found" }, 404);
  return noStore({
    ok: true,
    production: process.env.VERCEL_ENV === "production",
    browser_write_key_present: Boolean(String(process.env.TRACEKIT_BROWSER_WRITE_KEY || "").trim()),
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return noStore({ ok: false, error: "not_found" }, 404);
  if (process.env.VERCEL_ENV !== "production") return noStore({ ok: false, error: "production_only" }, 409);
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== CONFIRMATION) return noStore({ ok: false, error: "explicit_confirmation_required" }, 400);
  const writeKey = String(process.env.TRACEKIT_BROWSER_WRITE_KEY || "").trim();
  if (!writeKey) return noStore({ ok: false, error: "browser_write_key_absent" }, 503);
  const endpoint = "https://api.trace-kit.io/v1/browser/events";
  const results = [];
  for (const fixture of FIXTURES) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://example.com",
        "X-TraceKit-Write-Key": writeKey,
        "X-TraceKit-Workspace-Id": "default",
      },
      body: JSON.stringify({
        workspace_id: "default",
        event_id: fixture.eventId,
        event_type: "identify",
        event_time: new Date().toISOString(),
        tkid: fixture.tkid,
        session_id: fixture.sessionId,
        external_customer_id: fixture.externalCustomerId,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    results.push({
      case: fixture.caseNumber,
      http_status: response.status,
      event_id: fixture.eventId,
      tkid: fixture.tkid,
      status: typeof payload.status === "string" ? payload.status : null,
      normalization_queued: payload.normalization_queued === true,
      accepted: response.status === 202 && payload.ok === true,
    });
    if (!response.ok) break;
  }
  return noStore({ ok: results.length === FIXTURES.length && results.every((result) => result.accepted), results }, 200);
}
