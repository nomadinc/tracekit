import { NextResponse } from "next/server";
import { processShopifyWebhook, ShopifyWebhookError } from "@/lib/commerce/shopify-webhook-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const result = await processShopifyWebhook({
      rawBody,
      hmac: request.headers.get("x-shopify-hmac-sha256") || "",
      shopDomain: request.headers.get("x-shopify-shop-domain") || "",
      topic: request.headers.get("x-shopify-topic") || "",
      webhookId: request.headers.get("x-shopify-webhook-id") || "",
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof ShopifyWebhookError) {
      return NextResponse.json({ ok: false, code: error.code }, { status: error.status });
    }
    console.error("shopify_webhook_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, code: "shopify_webhook_failed" }, { status: 500 });
  }
}
