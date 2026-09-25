export type AdminAuthEnv = { TK_SECRET_KEY?: string };

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, X-TK-Secret, X-Webhook-Signature",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export function adminAuthError(req: Request, env: AdminAuthEnv) {
  const expected = String(env.TK_SECRET_KEY || "").trim();
  if (!expected) return json({ ok: false, error: "admin_auth_not_configured" }, 500);
  const headerSecret = String(req.headers.get("x-tk-secret") || "").trim();
  const authorization = String(req.headers.get("authorization") || "").trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const supplied = headerSecret || String(bearerMatch?.[1] || "").trim();
  if (supplied && supplied === expected) return null;
  return json({ ok: false, error: "unauthorized" }, 401);
}
