import "server-only";
import type { CommerceConnectionVerifier } from "./control-plane";

export const NEXT29_ADMIN_API_VERSION = "2024-04-01";

type StoredNext29Credential = {
  store: string;
  accessToken: string;
  apiVersion: string;
};

type Next29VerificationResource = "orders" | "subscriptions" | "disputes";
type Next29VerificationFailureCode = "provider_http_error" | "invalid_response" | "request_failed";

export class Next29VerificationError extends Error {
  readonly resource: Next29VerificationResource;
  readonly providerStatus: number | null;
  readonly providerRequestId: string | null;
  readonly failureCode: Next29VerificationFailureCode;

  constructor(input: {
    resource: Next29VerificationResource;
    providerStatus: number | null;
    providerRequestId: string | null;
    failureCode: Next29VerificationFailureCode;
  }) {
    const status = input.providerStatus == null ? "unknown" : String(input.providerStatus);
    const requestId = input.providerRequestId || "none";
    super(`29Next verification failed · resource ${input.resource} · provider status ${status} · request id ${requestId} · code ${input.failureCode}`);
    this.name = "Next29VerificationError";
    this.resource = input.resource;
    this.providerStatus = input.providerStatus;
    this.providerRequestId = input.providerRequestId;
    this.failureCode = input.failureCode;
  }
}

export function normalizeNext29Store(value: unknown) {
  let store = String(value ?? "").trim().toLowerCase();
  if (!store) return null;
  store = store.replace(/^https?:\/\//, "").split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  if (store.endsWith(".29next.store")) store = store.slice(0, -".29next.store".length);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(store)) return null;
  return store;
}

export function serializeNext29ConnectionCredential(input: {
  store: unknown;
  accessToken: unknown;
  apiVersion?: unknown;
}) {
  const store = normalizeNext29Store(input.store);
  const accessToken = String(input.accessToken ?? "").trim();
  const requestedVersion = String(input.apiVersion ?? NEXT29_ADMIN_API_VERSION).trim();
  const apiVersion = /^20\d\d-\d\d-\d\d$/.test(requestedVersion)
    ? requestedVersion
    : NEXT29_ADMIN_API_VERSION;
  if (!store) throw new Error("Enter a valid 29Next store slug or store domain.");
  if (accessToken.length < 8) throw new Error("Enter a valid 29Next Admin API access token.");
  return JSON.stringify({ store, accessToken, apiVersion } satisfies StoredNext29Credential);
}

export function parseNext29ConnectionCredential(secret: string): StoredNext29Credential {
  let parsed: Partial<StoredNext29Credential>;
  try {
    parsed = JSON.parse(secret) as Partial<StoredNext29Credential>;
  } catch {
    throw new Error("The 29Next credential is invalid.");
  }
  const store = normalizeNext29Store(parsed.store);
  const accessToken = String(parsed.accessToken ?? "").trim();
  const apiVersion = String(parsed.apiVersion ?? NEXT29_ADMIN_API_VERSION).trim();
  if (!store || accessToken.length < 8 || !/^20\d\d-\d\d-\d\d$/.test(apiVersion)) {
    throw new Error("The 29Next credential is invalid.");
  }
  return { store, accessToken, apiVersion };
}

function providerRequestId(response: Response) {
  return response.headers.get("x-request-id") || response.headers.get("x-29next-request-id") || response.headers.get("request-id");
}

function emitSafeDiagnostic(error: Next29VerificationError) {
  console.warn("next29_connection_verification_failed", {
    resource: error.resource,
    providerStatus: error.providerStatus,
    providerRequestId: error.providerRequestId,
    failureCode: error.failureCode,
  });
}

export class BoundedNext29ConnectionVerifier implements CommerceConnectionVerifier {
  async verify(input: { provider: string; environment: string; secret: string; correlationId: string }) {
    if (input.provider !== "next29") throw new Error("Provider verification is unavailable.");
    const credential = parseNext29ConnectionCredential(input.secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const base = `https://${credential.store}.29next.store/api/admin/`;
      const resources = ["orders", "subscriptions", "disputes"] as const;
      let providerRequestIdPresent = false;
      let rateLimitRemaining: number | null = null;
      let providerStatus = 200;

      for (const resource of resources) {
        let response: Response;
        try {
          response = await fetch(new URL(`${resource}/`, base).toString(), {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${credential.accessToken}`,
              "X-29Next-Api-Version": credential.apiVersion,
              Accept: "application/json",
              "x-correlation-id": input.correlationId,
            },
          });
        } catch {
          const error = new Next29VerificationError({
            resource,
            providerStatus: null,
            providerRequestId: null,
            failureCode: "request_failed",
          });
          emitSafeDiagnostic(error);
          throw error;
        }

        providerStatus = response.status;
        const requestId = providerRequestId(response);
        providerRequestIdPresent ||= Boolean(requestId);
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining && /^\d+$/.test(remaining)) rateLimitRemaining = Number(remaining);

        if (!response.ok) {
          const error = new Next29VerificationError({
            resource,
            providerStatus: response.status,
            providerRequestId: requestId,
            failureCode: "provider_http_error",
          });
          emitSafeDiagnostic(error);
          throw error;
        }

        const payload = (await response.json().catch(() => null)) as { results?: unknown[] } | null;
        if (!payload || !Array.isArray(payload.results)) {
          const error = new Next29VerificationError({
            resource,
            providerStatus: response.status,
            providerRequestId: requestId,
            failureCode: "invalid_response",
          });
          emitSafeDiagnostic(error);
          throw error;
        }
      }

      return {
        capabilities: ["orders.read", "subscriptions.read", "disputes.read", "webhooks.signed"],
        providerStatus,
        providerRequestIdPresent,
        rateLimitRemaining,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
