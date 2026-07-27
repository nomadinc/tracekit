function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}

export async function GET(req: Request) {
  const secret = adminSecret();
  if (!secret) {
    return Response.json({
      ok: false,
      error: "admin_auth_not_configured",
      message: "TK_SECRET_KEY is required on the UI server for Live Workspace requests.",
    }, { status: 500 });
  }
  const url = new URL(req.url);
  const upstream = await fetch(`${apiBaseUrl()}/v1/events/stream?${url.searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "text/event-stream",
      "x-tk-secret": secret,
      ...(req.headers.get("Last-Event-ID") ? { "Last-Event-ID": req.headers.get("Last-Event-ID") as string } : {}),
    },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
