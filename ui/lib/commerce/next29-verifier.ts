import "server-only";
import type { CommerceConnectionVerifier } from "./control-plane";

export const NEXT29_ADMIN_API_VERSION = "2024-04-01";

type StoredNext29Credential = {
  store: string;
  accessToken: string;
  apiVersion: string;
};

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

export class BoundedNext29ConnectionVerifier implements CommerceConnectionVerifier {
  async verify(input: { provider: string; environment: string; secret: string; correlationId: string }) {
    if (input.provider !== "next29") throw new Error("Provider verification is unavailable.");
    const credential = parseNext29ConnectionCredential(input.secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const base = `https://${credential.store}.29next.store/api/admin/`;
      const resources = ["orders/", "subscriptions/", "disputes/"] as const;
      let providerRequestIdPresent = false;
      let rateLimitRemaining: number | null = null;
      let providerStatus = 200;

      for (const resource of resources) {
        const url = new URL(resource, base);
        url.searchParams.set("limit", "1");
        const response = await fetch(url.toString(), {
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
        providerStatus = response.status;
        providerRequestIdPresent ||= Boolean(response.headers.get("x-request-id") || response.headers.get("x-29next-request-id") || response.headers.get("request-id"));
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining && /^\d+$/.test(remaining)) rateLimitRemaining = Number(remaining);
        if (!response.ok) throw new Error(`29Next ${resource.replace("/", "")} verification failed.`);
        const payload = (await response.json().catch(() => null)) as { results?: unknown[] } | null;
        if (!payload || !Array.isArray(payload.results)) throw new Error("29Next verification returned an invalid response.");
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
