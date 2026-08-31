import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOPIFY_OAUTH_SCOPES = ["read_products", "read_customers", "read_orders", "read_all_orders"] as const;

export function normalizeShopifyOAuthShop(value: unknown) {
  let domain = String(value ?? "").trim().toLowerCase();
  if (!domain) return null;
  domain = domain.replace(/^https?:\/\//, "").split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  domain = domain.replace(/\.+$/, "");
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null;
}

export function shopifyOAuthConfiguration(origin: string) {
  const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.SHOPIFY_OAUTH_REDIRECT_URI || `${origin.replace(/\/$/, "")}/api/shopify/oauth/callback`).trim();
  if (!clientId || !clientSecret) throw new Error("Shopify OAuth is not configured.");
  return { clientId, clientSecret, redirectUri };
}

export function buildShopifyAuthorizationUrl(input: {
  shop: string;
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const shop = normalizeShopifyOAuthShop(input.shop);
  if (!shop) throw new Error("Enter a valid Shopify myshopify.com domain.");
  const params = new URLSearchParams({
    client_id: input.clientId,
    scope: SHOPIFY_OAUTH_SCOPES.join(","),
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyOAuthCallback(searchParams: URLSearchParams, clientSecret: string) {
  const hmac = searchParams.get("hmac") || "";
  if (!/^[a-f0-9]{64}$/i.test(hmac)) return false;
  const entries = Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b));
  const message = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const expected = createHmac("sha256", clientSecret).update(message).digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(hmac, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function exchangeShopifyAuthorizationCode(input: {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  const shop = normalizeShopifyOAuthShop(input.shop);
  if (!shop) throw new Error("Invalid Shopify shop domain.");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
    }),
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; scope?: string } | null;
  const accessToken = String(payload?.access_token || "").trim();
  if (!response.ok || !accessToken) throw new Error("Shopify authorization failed.");
  return { accessToken, scope: String(payload?.scope || "") };
}
