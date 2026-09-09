import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { parseShopifyConnectionCredential, serializeShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

async function contextFor(connectionId: string) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("unavailable");
  const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore(), verifier: new CommerceProviderConnectionVerifier() });
  const connection = await plane.getConnection(resolution.session, connectionId);
  if (connection.provider !== "shopify") throw new Error("unavailable");
  const raw = await plane.resolveCredentialForExecution(resolution.session, connectionId);
  return { session: resolution.session, plane, credential: parseShopifyConnectionCredential(raw) };
}

export async function GET(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get("connectionId") || "";
    if (!connectionId) return response({ ok: false, message: "Connection is required." }, 400);
    const { credential } = await contextFor(connectionId);
    return response({ ok: true, configured: Boolean(credential.appSecret) });
  } catch {
    return response({ ok: false, message: "The requested resource is unavailable." }, 404);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return response({ ok: false, message: "Request verification failed." }, 403);
    const body = await request.json().catch(() => null) as { connectionId?: unknown; appSecret?: unknown } | null;
    const connectionId = String(body?.connectionId || "").trim();
    const appSecret = String(body?.appSecret || "").trim();
    if (!connectionId || appSecret.length < 8) return response({ ok: false, message: "Enter a valid Shopify app secret." }, 400);
    const { session, plane, credential } = await contextFor(connectionId);
    const merged = serializeShopifyConnectionCredential({
      shopDomain: credential.shopDomain,
      adminAccessToken: credential.adminAccessToken,
      apiVersion: credential.apiVersion,
      appSecret,
    });
    await plane.rotateCredential(session, connectionId, merged);
    return response({ ok: true, configured: true, message: "Shopify app secret saved securely." });
  } catch {
    return response({ ok: false, message: "TraceKit could not save the Shopify app secret." }, 500);
  }
}
