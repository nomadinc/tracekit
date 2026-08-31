import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { parseShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const QUERY = `query TraceKitShopifyBoundedIngest {
  products(first: 3, sortKey: UPDATED_AT, reverse: true) {
    nodes { id title description updatedAt createdAt variants(first: 10) { nodes { id title sku price } } }
  }
}`;

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { connectionId?: string } | null;
  const connectionId = String(body?.connectionId || "").trim();
  if (!connectionId) return NextResponse.json({ ok: false, error: "connection_required" }, { status: 400 });

  const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore(), verifier: new CommerceProviderConnectionVerifier() });
  try {
    const connection = await plane.getConnection(resolution.session, connectionId);
    if (connection.provider !== "shopify") return NextResponse.json({ ok: false, error: "not_shopify" }, { status: 400 });
    const accounts = await plane.listProviderAccounts(resolution.session, connectionId);
    const providerAccount = accounts.find((item) => item.status === "active");
    if (!providerAccount) return NextResponse.json({ ok: false, error: "provider_account_missing" }, { status: 400 });
    const secret = await plane.resolveCredentialForExecution(resolution.session, connectionId);
    const credential = parseShopifyConnectionCredential(secret);

    const response = await fetch(`https://${credential.shopDomain}/admin/api/${credential.apiVersion}/graphql.json`, {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json", "x-shopify-access-token": credential.adminAccessToken },
      body: JSON.stringify({ query: QUERY }),
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok || payload?.errors?.length) return NextResponse.json({ ok: false, error: "shopify_read_failed" }, { status: 502 });
    const products = Array.isArray(payload?.data?.products?.nodes) ? payload.data.products.nodes : [];

    const runRows = await commercePersistenceRequest("commerce_sync_runs", {
      method: "POST",
      body: JSON.stringify({ organization_id: connection.organizationId, connection_id: connection.id, provider_account_id: providerAccount.id, sync_type: "shopify_products_bounded", mode: "manual_smoke" }),
    });
    const syncRunId = String(runRows[0]?.id || "");
    if (!syncRunId) throw new Error("sync_run_create_failed");

    const first = await persistPass(products, connection, providerAccount.id, syncRunId);
    const second = await persistPass(products, connection, providerAccount.id, syncRunId);
    await commercePersistenceRequest(`commerce_sync_runs?id=eq.${encodeURIComponent(syncRunId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), records_seen: products.length, records_created: first.productsCreated, records_updated: second.productsReused, evidence_writes: first.evidenceCreated, evidence_reuses: second.evidenceReused, updated_at: new Date().toISOString() }),
    });
    console.info("shopify_bounded_ingest", { connectionId, syncRunId, products: products.length, first, second });
    return NextResponse.json({ ok: true, syncRunId, products: products.length, firstPass: first, secondPass: second, idempotent: second.evidenceCreated === 0 && second.evidenceReused === products.length });
  } catch (error) {
    console.error("shopify_bounded_ingest_failed", { connectionId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, error: "shopify_ingest_failed" }, { status: 500 });
  }
}

async function persistPass(products: any[], connection: any, providerAccountId: string, syncRunId: string) {
  let evidenceCreated = 0, evidenceReused = 0, productsCreated = 0, productsReused = 0;
  for (const product of products) {
    const payloadText = JSON.stringify(product);
    const payloadHash = createHash("sha256").update(payloadText).digest("hex");
    const sourceObjectId = String(product.id);
    const evidence = await commercePersistenceRequest(`commerce_evidence_records?organization_id=eq.${encodeURIComponent(connection.organizationId)}&connection_id=eq.${encodeURIComponent(connection.id)}&provider_account_id=eq.${encodeURIComponent(providerAccountId)}&source_object_type=eq.shopify_product&source_object_id=eq.${encodeURIComponent(sourceObjectId)}&payload_hash=eq.${payloadHash}&select=id&limit=1`);
    let evidenceId = evidence[0]?.id ? String(evidence[0].id) : "";
    if (!evidenceId) {
      evidenceId = crypto.randomUUID();
      await commercePersistenceRequest("commerce_evidence_records", { method: "POST", body: JSON.stringify({ id: evidenceId, organization_id: connection.organizationId, connection_id: connection.id, provider_account_id: providerAccountId, sync_run_id: syncRunId, source_object_type: "shopify_product", source_object_id: sourceObjectId, payload_hash: payloadHash, storage_backend: "database_inline", storage_reference: `shopify-bounded:${sourceObjectId}:${payloadHash}`, content_type: "application/json", byte_size: Buffer.byteLength(payloadText), source_created_at: product.createdAt || null, source_updated_at: product.updatedAt || null, observed_at: new Date().toISOString(), normalizer_version: "shopify-v1", pii_classification: "none", retention_policy: "commerce_default", metadata: { provider: "shopify", resource: "products", bounded_smoke: true, payload: product } }) });
      evidenceCreated++;
    } else evidenceReused++;

    const existing = await commercePersistenceRequest(`commerce_provider_products?organization_id=eq.${encodeURIComponent(connection.organizationId)}&connection_id=eq.${encodeURIComponent(connection.id)}&provider_account_id=eq.${encodeURIComponent(providerAccountId)}&provider_product_id=eq.${encodeURIComponent(sourceObjectId)}&select=id,first_seen_at&limit=1`);
    const variants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes.map((v: any) => ({ provider_variant_id: String(v.id), title: v.title || null, sku: v.sku || null, price: v.price == null ? null : Number(v.price) })) : [];
    await commercePersistenceRequest("commerce_provider_products?on_conflict=connection_id,provider_account_id,provider_product_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ organization_id: connection.organizationId, connection_id: connection.id, provider_account_id: providerAccountId, provider_product_id: sourceObjectId, title: String(product.title || "Unknown Shopify Product"), description: product.description || null, evidence_id: evidenceId, first_seen_at: existing[0]?.first_seen_at || product.updatedAt || new Date().toISOString(), last_seen_at: product.updatedAt || new Date().toISOString(), mapping_status: "observed", mapping_version: "shopify-product-v1", metadata: { shopify_variants: variants }, updated_at: new Date().toISOString() }) });
    if (existing[0]) productsReused++; else productsCreated++;
  }
  return { evidenceCreated, evidenceReused, productsCreated, productsReused };
}
