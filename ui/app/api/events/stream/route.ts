export async function GET() {
  if (process.env.TRACEKIT_REAL_DATA_ENABLED !== "true") {
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store", "x-tracekit-live-events": "disabled" },
    });
  }
  return Response.json({
    ok: false,
    error: "live_events_unavailable",
    message: "Live events remain disabled until tenant scope is derived from the authenticated TraceKit session.",
  }, { status: 503, headers: { "cache-control": "no-store" } });
}
