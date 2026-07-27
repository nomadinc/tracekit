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

async function eventExplorerFetch(pathAndQuery: string) {
  const secret = adminSecret();
  if (!secret) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "admin_auth_not_configured",
        message: "TK_SECRET_KEY is required on the UI server for Event Explorer requests.",
      },
    };
  }
  const res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-tk-secret": secret,
    },
  });
  return { ok: res.ok, status: res.status, body: await readJsonSafe(res) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const result = await eventExplorerFetch(`/v1/events${search ? `?${search}` : ""}`);
  return NextResponse.json(result.body, { status: result.status });
}
