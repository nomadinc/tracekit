import "server-only";
import type { CommerceConnectionVerifier } from "./control-plane";

export const SHOPIFY_ADMIN_API_VERSION = "2026-07";

type StoredShopifyCredential = {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion: string;
};

export function normalizeShopifyConnectionDomain(value: unknown) {
  let domain = String(value ?? "").trim().toLowerCase();
  if (!domain) return null;
  domain = domain.replace(/^https?:\/\//, "").split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  domain = domain.replace(/\.+$/, "");
  if (!domain) return null;
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return null;
  return domain;
}

export function serializeShopifyConnectionCredential(input: {
  shopDomain: unknown;
  adminAccessToken: unknown;
  apiVersion?: unknown;
}) {
  const shopDomain = normalizeShopifyConnectionDomain(input.shopDomain);
  const adminAccessToken = String(input.adminAccessToken ?? "").trim();
  const requestedVersion = String(input.apiVersion ?? SHOPIFY_ADMIN_API_VERSION).trim();
  const apiVersion = /^20\d\d-(01|04|07|10)$/.test(requestedVersion)
    ? requestedVersion
    : SHOPIFY_ADMIN_API_VERSION;
  if (!shopDomain) throw new Error("Enter a valid Shopify myshopify.com domain.");
  if (adminAccessToken.length < 8) throw new Error("Enter a valid Shopify Admin API access token.");
  return JSON.stringify({ shopDomain, adminAccessToken, apiVersion } satisfies StoredShopifyCredential);
}

export function parseShopifyConnectionCredential(secret: string): StoredShopifyCredential {
  let parsed: Partial<StoredShopifyCredential>;
  try {
    parsed = JSON.parse(secret) as Partial<StoredShopifyCredential>;
  } catch {
    throw new Error("The Shopify credential is invalid.");
  }
  const shopDomain = normalizeShopifyConnectionDomain(parsed.shopDomain);
  const adminAccessToken = String(parsed.adminAccessToken ?? "").trim();
  const apiVersion = String(parsed.apiVersion ?? SHOPIFY_ADMIN_API_VERSION).trim();
  if (!shopDomain || adminAccessToken.length < 8 || !/^20\d\d-(01|04|07|10)$/.test(apiVersion)) {
    throw new Error("The Shopify credential is invalid.");
  }
  return { shopDomain, adminAccessToken, apiVersion };
}

export class BoundedShopifyConnectionVerifier implements CommerceConnectionVerifier {
  async verify(input: { provider: string; environment: string; secret: string; correlationId: string }) {
    if (input.provider !== "shopify") throw new Error("Provider verification is unavailable.");
    const credential = parseShopifyConnectionCredential(input.secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(
        `https://${credential.shopDomain}/admin/api/${credential.apiVersion}/graphql.json`,
        {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-shopify-access-token": credential.adminAccessToken,
            "x-correlation-id": input.correlationId,
          },
          body: JSON.stringify({ query: "query TraceKitConnectionTest { shop { id name myshopifyDomain } }" }),
        }
      );
      if (!response.ok) throw new Error("Shopify verification failed.");
      const payload = (await response.json().catch(() => null)) as {
        data?: { shop?: { id?: string; name?: string; myshopifyDomain?: string } };
        errors?: unknown[];
      } | null;
      if (!payload?.data?.shop?.id || payload.errors?.length) throw new Error("Shopify verification returned an invalid response.");
      const remaining = response.headers.get("x-shopify-shop-api-call-limit")?.split("/")[0];
      return {
        capabilities: ["shop.read", "products.read", "customers.read", "orders.read", "refunds.read"],
        providerStatus: response.status,
        providerRequestIdPresent: Boolean(response.headers.get("x-request-id") || response.headers.get("x-shopify-request-id")),
        rateLimitRemaining: remaining && /^\d+$/.test(remaining) ? Number(remaining) : null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
