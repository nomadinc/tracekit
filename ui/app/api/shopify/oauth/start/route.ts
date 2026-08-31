import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { authorizeCommerceOrganizationAccess } from "@/lib/commerce/control-plane";
import {
  buildShopifyAuthorizationUrl,
  normalizeShopifyOAuthShop,
  shopifyOAuthConfiguration,
} from "@/lib/commerce/shopify-oauth";

const OAUTH_COOKIE = "tk_shopify_oauth";

export async function GET(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
    return NextResponse.redirect(new URL("/connections?shopify=auth_required", request.url));
  }

  try {
    authorizeCommerceOrganizationAccess(
      resolution.session,
      resolution.session.activeOrganization.id,
      "connectors.manage",
    );
  } catch {
    return NextResponse.redirect(new URL("/connections?shopify=forbidden", request.url));
  }

  const url = new URL(request.url);
  const shop = normalizeShopifyOAuthShop(url.searchParams.get("shop"));
  const displayName = String(url.searchParams.get("displayName") || "Shopify Store").trim().slice(0, 100);
  if (!shop) return NextResponse.redirect(new URL("/connections?shopify=invalid_shop", request.url));

  let config: ReturnType<typeof shopifyOAuthConfiguration>;
  try {
    config = shopifyOAuthConfiguration(url.origin);
  } catch {
    return NextResponse.redirect(new URL("/connections?shopify=oauth_unconfigured", request.url));
  }

  const state = randomBytes(24).toString("hex");
  const setupRequestId = randomUUID();
  const cookiePayload = Buffer.from(JSON.stringify({
    state,
    shop,
    displayName: displayName || "Shopify Store",
    setupRequestId,
    organizationId: resolution.session.activeOrganization.id,
  }), "utf8").toString("base64url");

  const response = NextResponse.redirect(buildShopifyAuthorizationUrl({
    shop,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
  }));
  response.cookies.set(OAUTH_COOKIE, cookiePayload, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/api/shopify/oauth",
    maxAge: 10 * 60,
  });
  return response;
}
