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

async function entityPathFromContext(context: any) {
  const params = await context?.params;
  const parts = Array.isArray(params?.entityPath) ? params.entityPath : [];
  return parts.map((part: string) => encodeURIComponent(part)).join("/");
}

export async function GET(req: Request, context: any) {
  const secret = adminSecret();
  if (!secret) {
    return NextResponse.json({
      ok: false,
      error: "admin_auth_not_configured",
      message: "TK_SECRET_KEY is required on the UI server for Entity Preview requests.",
    }, { status: 500 });
  }

  const path = await entityPathFromContext(context);
  if (!path) {
    return NextResponse.json({ ok: false, error: "bad_request", message: "entity preview path is required." }, { status: 400 });
  }
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const res = await fetch(`${apiBaseUrl()}/v1/entities/${path}${search ? `?${search}` : ""}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-tk-secret": secret,
    },
  });
  return NextResponse.json(await readJsonSafe(res), { status: res.status });
}
