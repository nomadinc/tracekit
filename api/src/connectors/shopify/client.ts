import {
  normalizeShopifyApiVersion,
  normalizeShopifyShopDomain,
  shopifyAdminGraphqlUrl,
} from "../../shopify";
import type {
  ShopifyAdminCredentials,
  ShopifyConnectionContext,
  ShopifyConnectionTestResult,
  ShopifyGraphqlEnvelope,
  ShopifyShopIdentity,
} from "./types";

const SHOP_IDENTITY_QUERY = `#graphql
  query TraceKitShopIdentity {
    shop {
      id
      name
      myshopifyDomain
      email
      currencyCode
      timezoneAbbreviation
    }
  }
`;

export class ShopifyConnectorError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, options?: { status?: number | null; code?: string }) {
    super(message);
    this.name = "ShopifyConnectorError";
    this.status = options?.status ?? null;
    this.code = options?.code ?? "shopify_request_failed";
  }
}

export type ShopifyFetch = typeof fetch;

function requireContext(context: ShopifyConnectionContext) {
  const organizationId = String(context.organizationId || "").trim();
  const connectionId = String(context.connectionId || "").trim();
  if (!organizationId) throw new ShopifyConnectorError("Shopify organization context is required.", { code: "missing_organization" });
  if (!connectionId) throw new ShopifyConnectorError("Shopify connection context is required.", { code: "missing_connection" });
  return { organizationId, connectionId };
}

function normalizeCredentials(credentials: ShopifyAdminCredentials) {
  const shopDomain = normalizeShopifyShopDomain(credentials.shopDomain);
  if (!shopDomain) {
    throw new ShopifyConnectorError("Invalid Shopify shop domain.", { code: "invalid_shop_domain" });
  }

  const accessToken = String(credentials.accessToken || "").trim();
  if (!accessToken) {
    throw new ShopifyConnectorError("Shopify Admin API access token is required.", { code: "missing_access_token" });
  }

  return {
    shopDomain,
    accessToken,
    apiVersion: normalizeShopifyApiVersion(credentials.apiVersion),
  };
}

function errorFromResponse(status: number, errors: Array<{ message?: string; extensions?: { code?: string } }> = []) {
  const graphqlMessage = errors.map((error) => String(error?.message || "").trim()).filter(Boolean).slice(0, 3).join("; ");
  const graphqlCode = errors.map((error) => String(error?.extensions?.code || "").trim()).find(Boolean);

  if (status === 401) return new ShopifyConnectorError("Shopify rejected the Admin API access token.", { status, code: "invalid_credentials" });
  if (status === 403) return new ShopifyConnectorError("Shopify Admin API access scopes are insufficient.", { status, code: "insufficient_scope" });
  if (status === 429) return new ShopifyConnectorError("Shopify Admin API rate limit exceeded.", { status, code: "rate_limited" });

  return new ShopifyConnectorError(
    graphqlMessage || `Shopify Admin API request failed with status ${status}.`,
    { status, code: graphqlCode || "shopify_graphql_error" },
  );
}

export class ShopifyAdminClient {
  readonly context: ShopifyConnectionContext;
  readonly shopDomain: string;
  readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly fetchImpl: ShopifyFetch;

  constructor(args: {
    context: ShopifyConnectionContext;
    credentials: ShopifyAdminCredentials;
    fetchImpl?: ShopifyFetch;
  }) {
    this.context = requireContext(args.context);
    const credentials = normalizeCredentials(args.credentials);
    this.shopDomain = credentials.shopDomain;
    this.apiVersion = credentials.apiVersion;
    this.accessToken = credentials.accessToken;
    this.fetchImpl = args.fetchImpl ?? fetch;
  }

  async graphql<TData>(query: string, variables: Record<string, unknown> = {}): Promise<TData> {
    const response = await this.fetchImpl(shopifyAdminGraphqlUrl(this.shopDomain, this.apiVersion), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    let envelope: ShopifyGraphqlEnvelope<TData>;
    try {
      envelope = (await response.json()) as ShopifyGraphqlEnvelope<TData>;
    } catch {
      throw new ShopifyConnectorError("Shopify Admin API returned a non-JSON response.", {
        status: response.status,
        code: "invalid_response",
      });
    }

    if (!response.ok || (Array.isArray(envelope.errors) && envelope.errors.length > 0)) {
      throw errorFromResponse(response.status, envelope.errors);
    }
    if (!envelope.data) {
      throw new ShopifyConnectorError("Shopify Admin API response did not contain data.", {
        status: response.status,
        code: "missing_data",
      });
    }

    return envelope.data;
  }

  async getShopIdentity(): Promise<ShopifyShopIdentity> {
    const data = await this.graphql<{ shop: ShopifyShopIdentity }>(SHOP_IDENTITY_QUERY);
    if (!data.shop?.id || !data.shop?.myshopifyDomain) {
      throw new ShopifyConnectorError("Shopify shop identity response is incomplete.", { code: "invalid_shop_identity" });
    }
    return data.shop;
  }

  async testConnection(): Promise<ShopifyConnectionTestResult> {
    const shop = await this.getShopIdentity();
    return {
      ok: true,
      organizationId: this.context.organizationId,
      connectionId: this.context.connectionId,
      shopDomain: this.shopDomain,
      apiVersion: this.apiVersion,
      shop,
    };
  }
}
