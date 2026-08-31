import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { serializeShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import {
  exchangeShopifyAuthorizationCode,
  normalizeShopifyOAuthShop,
  shopifyOAuthConfiguration,
  verifyShopifyOAuthCallback,
} from "@/lib/commerce/shopify-oauth";

const OAUTH_COOKIE = "tk_shopify_oauth";
type OAuthCookie = {
  state: string;
  shop: string;
  displayName: string;
  setupRequestId: string;
  organizationId: string;
};

function readCookie(request: Request): OAuthCookie | null {
  const header = request.headers.get("cookie") || "";
  const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(decodeURIComponent(value), "base64url").toString("utf8")) as OAuthCookie;
  } catch {
    return null;
  }
}

function redirect(request: Request, result: string, connectionId?: string) {
  const destination = connectionId
    ? new URL(`/connections/commerce/${connectionId}?shopify=${encodeURIComponent(result)}`, request.url)
    : new URL(`/connections?shopify=${encodeURIComponent(result)}`, request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/api/shopify/oauth",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
    return redirect(request, "auth_required");
  }

  const url = new URL(request.url);
  const cookie = readCookie(request);
  const shop = normalizeShopifyOAuthShop(url.searchParams.get("shop"));
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!cookie || !shop || !code || !state || state !== cookie.state || shop !== cookie.shop) {
    return redirect(request, "invalid_oauth_state");
  }
  if (cookie.organizationId !== resolution.session.activeOrganization.id) {
    return redirect(request, "organization_changed");
  }

  let config: ReturnType<typeof shopifyOAuthConfiguration>;
  try {
    config = shopifyOAuthConfiguration(url.origin);
  } catch {
    return redirect(request, "oauth_unconfigured");
  }
  if (!verifyShopifyOAuthCallback(url.searchParams, config.clientSecret)) {
    return redirect(request, "invalid_shopify_signature");
  }

  let accessToken: string;
  try {
    ({ accessToken } = await exchangeShopifyAuthorizationCode({
      shop,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
    }));
  } catch {
    return redirect(request, "token_exchange_failed");
  }

  const plane = createCommerceControlPlane({
    evidenceStore: new MemoryCommerceEvidenceStore(),
    verifier: new CommerceProviderConnectionVerifier(),
  });
  const credentialSecret = serializeShopifyConnectionCredential({
    shopDomain: shop,
    adminAccessToken: accessToken,
    apiVersion: "2026-07",
  });

  try {
    const accounts = await commercePersistenceRequest(
      `commerce_provider_accounts?organization_id=eq.${encodeURIComponent(cookie.organizationId)}&provider_account_external_id=eq.${encodeURIComponent(shop)}&status=eq.active&select=connection_id&limit=1`,
    );
    let connectionId = accounts[0]?.connection_id ? String(accounts[0].connection_id) : "";

    if (connectionId) {
      const existing = await plane.getConnection(resolution.session, connectionId);
      if (existing.provider !== "shopify") return redirect(request, "connection_conflict");
      await plane.updateConnection(resolution.session, connectionId, { displayName: cookie.displayName });
      const credential = await plane.credentialStatus(resolution.session, connectionId);
      if (credential.status === "active") await plane.rotateCredential(resolution.session, connectionId, credentialSecret);
      else await plane.createCredential(resolution.session, connectionId, credentialSecret);
      await plane.upsertProviderAccount(resolution.session, connectionId, { externalId: shop, status: "active" });
    } else {
      const connection = await plane.createConnection(resolution.session, cookie.organizationId, {
        provider: "shopify",
        displayName: cookie.displayName,
        environment: "production",
        setupRequestId: cookie.setupRequestId,
      });
      connectionId = connection.id;
      await plane.upsertProviderAccount(resolution.session, connectionId, { externalId: shop, status: "active" });
      await plane.createCredential(resolution.session, connectionId, credentialSecret);
    }

    try {
      await plane.verifyConnection(resolution.session, connectionId);
      return redirect(request, "connected", connectionId);
    } catch {
      return redirect(request, "verification_failed", connectionId);
    }
  } catch {
    return redirect(request, "connection_save_failed");
  }
}
