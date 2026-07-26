import { NextResponse } from "next/server";

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

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 400) };
  }
}

async function notificationFetch(pathAndQuery: string, init: RequestInit = {}) {
  const secret = adminSecret();
  if (!secret) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "admin_auth_not_configured",
        message: "TK_SECRET_KEY is required on the UI server for Notification Engine requests.",
      },
    };
  }
  const res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-tk-secret": secret,
      ...(init.headers || {}),
    },
  });
  return { status: res.status, body: await readJsonSafe(res) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const result = await notificationFetch(`/v1/notifications${search ? `?${search}` : ""}`, { method: "GET" });
  return NextResponse.json(result.body, { status: result.status });
}
