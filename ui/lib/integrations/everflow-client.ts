export const EVERFLOW_API_BASE = "https://api.eflow.team";
export const EVERFLOW_NETWORK_INFO_PATH = "/v1/networks";
export const EVERFLOW_NETWORK_INFO_URL = `${EVERFLOW_API_BASE}${EVERFLOW_NETWORK_INFO_PATH}`;
export const EVERFLOW_HEALTH_TIMEOUT_MS = 10_000;

export type EverflowNetworkIdentity = {
  networkId: string;
  customerId: string | null;
  name: string;
  displayedName: string | null;
  identifier: string | null;
  accountStatus: string | null;
  timezoneId: number | null;
  currencyId: string | null;
};

export type EverflowHealthFailureCode =
  | "everflow_authentication_failed"
  | "everflow_network_mismatch"
  | "everflow_rate_limited"
  | "everflow_unavailable"
  | "everflow_invalid_response"
  | "everflow_timeout";

export class EverflowHealthError extends Error {
  readonly code: EverflowHealthFailureCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: EverflowHealthFailureCode, message: string, httpStatus: number, retryable = false) {
    super(message);
    this.name = "EverflowHealthError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

function cleanString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function cleanInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeNetwork(payload: unknown): EverflowNetworkIdentity {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid network response.", 502, true);
  }
  const row = payload as Record<string, unknown>;
  const networkId = cleanString(row.network_id);
  const name = cleanString(row.displayed_name) || cleanString(row.name);
  if (!networkId || !name) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid network response.", 502, true);
  }
  return {
    networkId,
    customerId: cleanString(row.customer_id),
    name,
    displayedName: cleanString(row.displayed_name),
    identifier: cleanString(row.identifier),
    accountStatus: cleanString(row.account_status) || cleanString(row.status),
    timezoneId: cleanInteger(row.timezone_id ?? row.reporting_timezone_id),
    currencyId: cleanString(row.currency_id ?? row.default_currency_id),
  };
}

function expectedNetworkId(value: unknown) {
  const normalized = cleanString(value);
  return normalized ? normalized.replace(/^0+(?=\d)/, "") : null;
}

export async function getEverflowNetworkIdentity(input: {
  apiKey: string;
  networkId?: string | null;
  correlationId?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<EverflowNetworkIdentity> {
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length < 8) {
    throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || EVERFLOW_HEALTH_TIMEOUT_MS), 1_000), EVERFLOW_HEALTH_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = input.fetchImpl || fetch;

  try {
    const response = await fetchImpl(EVERFLOW_NETWORK_INFO_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-Eflow-Api-Key": apiKey,
        ...(input.correlationId ? { "x-correlation-id": input.correlationId } : {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    }
    if (response.status === 429) {
      throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited the health check. Try again later.", 429, true);
    }
    if (!response.ok) {
      throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the network health check.", 502, response.status >= 500);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid network response.", 502, true);
    }
    const network = normalizeNetwork(payload);
    const expected = expectedNetworkId(input.networkId);
    if (expected && expected !== expectedNetworkId(network.networkId)) {
      throw new EverflowHealthError("everflow_network_mismatch", "The supplied Everflow Network ID does not match the authenticated network.", 409, false);
    }
    return network;
  } catch (error) {
    if (error instanceof EverflowHealthError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new EverflowHealthError("everflow_timeout", "Everflow did not respond before the health-check timeout.", 504, true);
    }
    throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the network health check.", 502, true);
  } finally {
    clearTimeout(timeout);
  }
}
