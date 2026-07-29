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
    return { ok: false, error: "invalid_json", message: "Worker returned a non-JSON response." };
  }
}

export async function POST(req: Request) {
  const secret = adminSecret();
  if (!secret) {
    return NextResponse.json({
      ok: false,
      error: "admin_auth_not_configured",
      message: "TK_SECRET_KEY is required on the UI server for Financial Reconciliation requests.",
    }, { status: 500 });
  }

  const body = await req.text().catch(() => "");
  const res = await fetch(`${apiBaseUrl()}/v1/financial-reconciliation/matches`, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-tk-secret": secret,
    },
    body: body || "{}",
  });

  return NextResponse.json(await readJsonSafe(res), { status: res.status });
}
