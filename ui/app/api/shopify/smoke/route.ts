import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { parseShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";

const QUERY = `query TraceKitShopifySmoke {
  shop { id name myshopifyDomain }
  products(first: 5, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id title updatedAt
      variants(first: 5) { nodes { id sku price } }
    }
  }
  customers(first: 5, sortKey: UPDATED_AT, reverse: true) {
    nodes { id createdAt updatedAt }
  }
  orders(first: 5, sortKey: UPDATED_AT, reverse: true) {
    nodes {
      id name createdAt updatedAt displayFinancialStatus displayFulfillmentStatus
      lineItems(first: 10) { nodes { id quantity sku variant { id } } }
      refunds { id createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
    }
  }
}`;

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { connectionId?: string } | null;
  const connectionId = String(body?.connectionId || "").trim();
  if (!connectionId) return NextResponse.json({ ok: false, error: "connection_required" }, { status: 400 });

  const plane = createCommerceControlPlane({
    evidenceStore: new MemoryCommerceEvidenceStore(),
    verifier: new CommerceProviderConnectionVerifier(),
  });

  try {
    const connection = await plane.getConnection(resolution.session, connectionId);
    if (connection.provider !== "shopify") {
      return NextResponse.json({ ok: false, error: "not_shopify" }, { status: 400 });
    }
    const secret = await plane.resolveCredentialForExecution(resolution.session, connectionId);
    const credential = parseShopifyConnectionCredential(secret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`https://${credential.shopDomain}/admin/api/${credential.apiVersion}/graphql.json`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-shopify-access-token": credential.adminAccessToken,
          "x-correlation-id": resolution.session.correlationId,
        },
        body: JSON.stringify({ query: QUERY }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || payload?.errors?.length || !payload?.data?.shop?.id) {
        return NextResponse.json({
          ok: false,
          error: "shopify_smoke_failed",
          status: response.status,
          graphqlErrors: Array.isArray(payload?.errors) ? payload.errors.map((item: any) => String(item?.message || "GraphQL error")).slice(0, 5) : [],
        }, { status: 502 });
      }

      const products = Array.isArray(payload.data.products?.nodes) ? payload.data.products.nodes : [];
      const customers = Array.isArray(payload.data.customers?.nodes) ? payload.data.customers.nodes : [];
      const orders = Array.isArray(payload.data.orders?.nodes) ? payload.data.orders.nodes : [];
      const lineItems = orders.reduce((sum: number, order: any) => sum + (Array.isArray(order?.lineItems?.nodes) ? order.lineItems.nodes.length : 0), 0);
      const refunds = orders.reduce((sum: number, order: any) => sum + (Array.isArray(order?.refunds) ? order.refunds.length : 0), 0);
      const variants = products.reduce((sum: number, product: any) => sum + (Array.isArray(product?.variants?.nodes) ? product.variants.nodes.length : 0), 0);

      return NextResponse.json({
        ok: true,
        shop: {
          id: payload.data.shop.id,
          name: payload.data.shop.name,
          domain: payload.data.shop.myshopifyDomain,
        },
        counts: { products: products.length, variants, customers: customers.length, orders: orders.length, lineItems, refunds },
        samples: {
          products: products.map((product: any) => ({ id: product.id, title: product.title, updatedAt: product.updatedAt })),
          orders: orders.map((order: any) => ({ id: order.id, name: order.name, updatedAt: order.updatedAt, financialStatus: order.displayFinancialStatus, fulfillmentStatus: order.displayFulfillmentStatus })),
        },
        requestIdPresent: Boolean(response.headers.get("x-request-id") || response.headers.get("x-shopify-request-id")),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "shopify_smoke_failed" }, { status: 500 });
  }
}
