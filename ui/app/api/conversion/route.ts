import { NextResponse } from "next/server";
import {
  M2MockEverflowForwarder,
  processEverflowScrubberRequest,
  ScrubberGatewayError,
  SupabaseScrubberGatewayRepository,
} from "@/lib/integrations/everflow-scrubber-gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const result = await processEverflowScrubberRequest({
      authorization: request.headers.get("authorization"),
      rawBody: await request.text(),
      repository: new SupabaseScrubberGatewayRepository(),
      // This class has no network implementation. Live Everflow is impossible in M2.
      forwarder: new M2MockEverflowForwarder(),
      requestId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 202, headers: { "x-tracekit-request-id": requestId } });
  } catch (error) {
    if (error instanceof ScrubberGatewayError) {
      return NextResponse.json({ ok: false, code: error.code, requestId }, { status: error.status, headers: { "x-tracekit-request-id": requestId } });
    }
    console.error("everflow_scrubber_gateway_failed", { requestId, code: "SCRUBBER_INTERNAL_FAILURE" });
    return NextResponse.json({ ok: false, code: "SCRUBBER_INTERNAL_FAILURE", requestId }, { status: 503, headers: { "x-tracekit-request-id": requestId } });
  }
}
