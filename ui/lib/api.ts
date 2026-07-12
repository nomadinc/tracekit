// ui/lib/api.ts

export function getApiBaseUrl(): string {
  // In Next.js client bundles, NEXT_PUBLIC_* values are inlined at build time.
  // Returning "" means "same origin" (useful if you proxy /v1/* through Next).
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE ??
    "";

  return String(base).replace(/\/+$/, ""); // trim trailing slashes
}

function isProbablyHtml(s: string) {
  const t = s.trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.startsWith("<head") ||
    t.startsWith("<body")
  );
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function joinUrl(base: string, pathAndQuery: string) {
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  // If base is empty, this becomes "/v1/..." (same-origin)
  return `${base}${p}`;
}

export async function apiGetJson<T>(
  pathAndQuery: string,
  init?: RequestInit
): Promise<T> {
  const base = getApiBaseUrl();
  const url = joinUrl(base, pathAndQuery);

  const res = await fetch(url, {
    ...init,
    method: "GET",
    cache: "no-store",
    headers: {
      ...(init?.headers || {}),
      Accept: "application/json",
    },
  });

  const text = await readTextSafe(res);

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  // Helpful error when API_BASE points to Next UI (HTML) instead of Worker API.
  if (isProbablyHtml(text)) {
    throw new Error(
      `Received HTML instead of JSON (wrong API base URL or route). ${res.status} ${res.statusText}`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from API: ${text.slice(0, 140)}`);
  }
}

function getTkSecretForRequest(): string {
  // Best practice: keep this DEV-only.
  // In local dev, we can read from NEXT_PUBLIC_TK_SECRET_KEY (ui/.env.local).
  // Fallback to localStorage for convenience.
  const fromEnv = process.env.NEXT_PUBLIC_TK_SECRET_KEY ?? "";
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();

  // Client-side only fallback (won't exist during SSR, but this file is used client-side too)
  try {
    const v =
      localStorage.getItem("TK_SECRET_KEY") ||
      localStorage.getItem("tracekit:tk_secret_key") ||
      localStorage.getItem("tk_secret_key") ||
      "";
    return String(v).trim();
  } catch {
    return "";
  }
}

function withTkSecretHeader(headers: HeadersInit | undefined, url: string): HeadersInit {
  // Only attach for local dev to avoid leaking secrets in production.
  const isLocal =
    url.startsWith("http://127.0.0.1:") ||
    url.startsWith("http://localhost:");

  if (!isLocal) return headers || {};

  const secret = getTkSecretForRequest();
  if (!secret) return headers || {};

  return {
    ...(headers || {}),
    "x-tk-secret": secret,
  };
}

export async function apiPostJson<TOut, TIn = any>(
  pathAndQuery: string,
  body: TIn,
  init?: RequestInit
): Promise<TOut> {
  const base = getApiBaseUrl();
  const url = joinUrl(base, pathAndQuery);

  const res = await fetch(url, {
    ...init,
    method: "POST",
    cache: "no-store",
    headers: withTkSecretHeader(
      {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers || {}),
      },
      url
    ),
    body: JSON.stringify(body),
  });

  const text = await readTextSafe(res);

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  if (isProbablyHtml(text)) {
    throw new Error(
      `Received HTML instead of JSON (wrong API base URL or route). ${res.status} ${res.statusText}`
    );
  }

  try {
    return JSON.parse(text) as TOut;
  } catch {
    throw new Error(`Invalid JSON from API: ${text.slice(0, 140)}`);
  }
}
