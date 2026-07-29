function requestPath(pathAndQuery: string) {
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return p.split("?")[0] || "/";
}

function compactSummary(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function summarizeApiError(res: Response, text: string) {
  try {
    const json = text ? JSON.parse(text) : {};
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      return compactSummary(record.message ?? record.error ?? res.statusText);
    }
  } catch {
    // Avoid echoing non-JSON/HTML bodies into dashboard errors.
  }
  return compactSummary(res.statusText || "Request failed");
}

function apiError(status: number, pathAndQuery: string, summary?: string) {
  const suffix = summary ? ` — ${summary}` : "";
  return new Error(`API request failed: ${status} ${requestPath(pathAndQuery)}${suffix}`);
}

export async function sameOriginGetJson<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(pathAndQuery, {
    ...init,
    method: "GET",
    cache: "no-store",
    headers: {
      ...(init?.headers || {}),
      Accept: "application/json",
    },
  });
  const text = await readTextSafe(res);
  if (!res.ok) throw apiError(res.status, pathAndQuery, summarizeApiError(res, text));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw apiError(res.status, pathAndQuery, "Invalid JSON response");
  }
}

export async function sameOriginPostJson<TOut, TIn = any>(
  pathAndQuery: string,
  body: TIn,
  init?: RequestInit
): Promise<TOut> {
  const res = await fetch(pathAndQuery, {
    ...init,
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  });
  const text = await readTextSafe(res);
  if (!res.ok) throw apiError(res.status, pathAndQuery, summarizeApiError(res, text));
  try {
    return JSON.parse(text) as TOut;
  } catch {
    throw apiError(res.status, pathAndQuery, "Invalid JSON response");
  }
}
