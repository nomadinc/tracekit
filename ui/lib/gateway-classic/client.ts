type JsonObject = Record<string, unknown>;

function workerApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";
  return raw.replace(/\/+$/, "");
}

async function readJson<T>(response: Response, path: string) {
  const body = await response.text();
  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = JSON.parse(body) as JsonObject;
      message = String(payload.message || payload.error || message);
    } catch {}
    throw new Error(`API request failed: ${response.status} ${path} — ${message}`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`API request failed: ${response.status} ${path} — Invalid JSON response`);
  }
}

async function getApplicationJson<T>(path: string) {
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  return readJson<T>(response, path);
}

async function postApplicationJson<T>(path: string, body: JsonObject) {
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, path);
}

export function listGatewayClassicAccounts<T>() {
  return getApplicationJson<T>("/api/gateway-classic/list");
}

export function importGatewayClassicPage<T>(body: JsonObject) {
  return postApplicationJson<T>("/api/gateway-classic/import-one-page", body);
}

export async function saveGatewayClassicCredentials<T>(body: JsonObject) {
  const path = "/v1/integrations/save-credentials";
  const response = await fetch(`${workerApiBase()}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, path);
}
