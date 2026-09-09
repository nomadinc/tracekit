import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { parseShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";
import { ensureTraceKitShopifyWebhookSubscriptions, listTraceKitShopifyWebhookSubscriptions, SHOPIFY_WEBHOOK_TOPICS } from "@/lib/commerce/shopify-webhook-registration";

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
  const credential = parseShopifyConnectionCredential(raw);
  if (!credential.appSecret) throw new Error("missing_secret");
  return { credential };
}

function callbackUrlFor(request: Request) {
  return `${new URL(request.url).origin}/api/webhooks/shopify`;
}

export async function GET(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get("connectionId") || "";
    if (!connectionId) return response({ ok: false, message: "Connection is required." }, 400);
    const { credential } = await contextFor(connectionId);
    const callbackUrl = callbackUrlFor(request);
    const subscriptions = await listTraceKitShopifyWebhookSubscriptions({ credential, callbackUrl });
    const activeTopics = subscriptions.map((subscription) => subscription.topic);
    return response({
      ok: true,
      callbackUrl,
      requiredTopics: SHOPIFY_WEBHOOK_TOPICS,
      activeTopics,
      ready: SHOPIFY_WEBHOOK_TOPICS.every((topic) => activeTopics.includes(topic)),
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "missing_secret"
      ? "Save the Shopify app secret before activating webhooks."
      : "TraceKit could not inspect Shopify webhook subscriptions.";
    return response({ ok: false, message }, error instanceof Error && error.message === "missing_secret" ? 400 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return response({ ok: false, message: "Request verification failed." }, 403);
    const body = await request.json().catch(() => null) as { connectionId?: unknown } | null;
    const connectionId = String(body?.connectionId || "").trim();
    if (!connectionId) return response({ ok: false, message: "Connection is required." }, 400);
    const { credential } = await contextFor(connectionId);
    const callbackUrl = callbackUrlFor(request);
    const result = await ensureTraceKitShopifyWebhookSubscriptions({ credential, callbackUrl });
    return response({
      ok: true,
      callbackUrl,
      ready: result.ready,
      activeTopics: result.subscriptions.map((subscription) => subscription.topic),
      createdTopics: result.created.map((subscription) => subscription.topic),
    });
  } catch (error) {
    console.error("shopify_webhook_registration_failed", { message: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error && error.message === "missing_secret"
      ? "Save the Shopify app secret before activating webhooks."
      : "TraceKit could not activate Shopify webhooks.";
    return response({ ok: false, message }, error instanceof Error && error.message === "missing_secret" ? 400 : 500);
  }
}
