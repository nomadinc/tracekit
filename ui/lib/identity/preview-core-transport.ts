import "server-only";
import { ws023CorePreviewPath } from "./ws023-preview-policy";

// Keep the same Core entry point and authorization, without crossing the
// deployment's external authentication boundary for a server-local read.
export const previewCoreFetch: typeof fetch = async (input, init) => {
  if (process.env.VERCEL_ENV !== "preview" || process.env.TRACEKIT_WS023_READONLY_CORE_PREVIEW !== "enabled") {
    return fetch(input, init);
  }

  const request = new Request(input, init);
  const url = new URL(request.url);
  const host = process.env.VERCEL_URL;
  if (!host || !/^[a-z0-9.-]+\.vercel\.app$/.test(host) || url.origin !== `https://${host}` || !ws023CorePreviewPath(url.pathname)) {
    return Response.json({ error: "unavailable" }, { status: 404 });
  }
  if (request.method !== "GET") return Response.json({ error: "read_only" }, { status: 405 });

  const { GET } = await import("../../app/api/ws023-core/[...readPath]/route");
  return GET(request);
};
