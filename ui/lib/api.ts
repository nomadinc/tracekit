// ui/lib/api.ts

const API_BASE_CONFIG_MESSAGE =
  "TraceKit API base is not configured. Set NEXT_PUBLIC_API_BASE_URL to the Cloudflare Worker URL.";

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function isDeployedBrowserRuntime() {
  return typeof window !== "undefined" && !isLocalHostname(window.location.hostname);
}

export function getApiBaseUrl(): string {
  // In Next.js client bundles, NEXT_PUBLIC_* values are inlined at build time.
  // Returning "" means "same origin" only for local dev or a deliberate local proxy.
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE ??
    "";

  const normalized = String(base).trim().replace(/\/+$/, ""); // trim trailing slashes
  if (!normalized && isDeployedBrowserRuntime()) {
    throw new Error(API_BASE_CONFIG_MESSAGE);
  }
  return normalized;
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

function requestPath(pathAndQuery: string) {
  try {
    return new URL(pathAndQuery).pathname || "/";
  } catch {
    const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
    return p.split("?")[0] || "/";
  }
}

function compactSummary(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function summarizeApiError(res: Response, text: string) {
  if (!text || isProbablyHtml(text)) return compactSummary(res.statusText);

  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      return compactSummary(record.message ?? record.error ?? res.statusText);
    }
  } catch {
    // Non-JSON errors are intentionally summarized without echoing the body.
  }

  return compactSummary(res.statusText || "Non-JSON response");
}

function apiError(status: number, pathAndQuery: string, summary?: string) {
  const suffix = summary ? ` — ${summary}` : "";
  return new Error(`API request failed: ${status} ${requestPath(pathAndQuery)}${suffix}`);
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
    throw apiError(res.status, pathAndQuery, summarizeApiError(res, text));
  }

  // Helpful error when API_BASE points to Next UI (HTML) instead of Worker API.
  if (isProbablyHtml(text)) {
    throw apiError(res.status, pathAndQuery, "Expected JSON but received HTML");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw apiError(res.status, pathAndQuery, "Invalid JSON response");
  }
}

/** Fetch a Next.js application route from the current origin.
 *
 * Worker-backed callers should continue using apiGetJson(); application routes
 * must not be prefixed with NEXT_PUBLIC_API_BASE_URL.
 */
export async function sameOriginGetJson<T>(
  pathAndQuery: string,
  init?: RequestInit
): Promise<T> {
  const url = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const res = await fetch(url, {
    ...init,
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(init?.headers || {}),
      Accept: "application/json",
    },
  });

  const text = await readTextSafe(res);
  if (!res.ok) {
    throw apiError(res.status, url, summarizeApiError(res, text));
  }
  if (isProbablyHtml(text)) {
    throw apiError(res.status, url, "Expected JSON but received HTML");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw apiError(res.status, url, "Invalid JSON response");
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
    throw apiError(res.status, pathAndQuery, summarizeApiError(res, text));
  }

  if (isProbablyHtml(text)) {
    throw apiError(res.status, pathAndQuery, "Expected JSON but received HTML");
  }

  try {
    return JSON.parse(text) as TOut;
  } catch {
    throw apiError(res.status, pathAndQuery, "Invalid JSON response");
  }
}
