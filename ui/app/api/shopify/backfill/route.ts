import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { parseShopifyConnectionCredential } from "@/lib/commerce/shopify-verifier";
import { runShopifyHistoricalResource } from "@/lib/commerce/shopify-historical-runtime";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { ShopifySyncStageError } from "@/lib/commerce/shopify-core/sync";

const RESOURCES = new Set(["products", "customers", "orders"]);

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    connectionId?: string;
    resource?: string;
    maxPages?: number;
    pageSize?: number;
  } | null;
  const connectionId = String(body?.connectionId || "").trim();
  const resource = String(body?.resource || "").trim();
  if (!connectionId) return NextResponse.json({ ok: false, error: "connection_required" }, { status: 400 });
  if (!RESOURCES.has(resource)) return NextResponse.json({ ok: false, error: "resource_invalid" }, { status: 400 });

  const maxPages = boundedInteger(body?.maxPages, 1, 10, 2);
  const pageSize = boundedInteger(body?.pageSize, 1, 100, 50);
  const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore(), verifier: new CommerceProviderConnectionVerifier() });

  try {
    const connection = await plane.getConnection(resolution.session, connectionId);
    if (connection.provider !== "shopify") return NextResponse.json({ ok: false, error: "not_shopify" }, { status: 400 });
    const accounts = await plane.listProviderAccounts(resolution.session, connectionId);
    const providerAccount = accounts.find((item) => item.status === "active");
    if (!providerAccount) return NextResponse.json({ ok: false, error: "provider_account_missing" }, { status: 400 });

    const cutoffRows = await commercePersistenceRequest(
      `commerce_provider_connections?organization_id=eq.${encodeURIComponent(connection.organizationId)}&id=eq.${encodeURIComponent(connection.id)}&select=created_at&limit=1`,
    );
    const historicalCutoff = String(cutoffRows[0]?.created_at || "").trim();
    if (!historicalCutoff) return NextResponse.json({ ok: false, error: "historical_cutoff_missing" }, { status: 500 });

    const secret = await plane.resolveCredentialForExecution(resolution.session, connectionId);
    const credential = parseShopifyConnectionCredential(secret);
    const result = await runShopifyHistoricalResource({
      organizationId: connection.organizationId,
      connectionId: connection.id,
      providerAccountId: providerAccount.id,
      resource: resource as "products" | "customers" | "orders",
      historicalCutoff,
      shopDomain: credential.shopDomain,
      accessToken: credential.adminAccessToken,
      apiVersion: credential.apiVersion,
      maxPages,
      pageSize,
    });

    return NextResponse.json({ ok: true, historicalCutoff, result });
  } catch (error) {
    const staged = error instanceof ShopifySyncStageError ? error : null;
    console.error("shopify_historical_backfill_failed", {
      connectionId,
      resource,
      stage: staged?.stage || "request",
      code: staged?.code || "shopify_historical_backfill_failed",
      message: staged?.diagnosticMessage || (error instanceof Error ? error.message : String(error)),
    });
    return NextResponse.json({
      ok: false,
      error: "shopify_historical_backfill_failed",
      stage: staged?.stage || "request",
      code: staged?.code || "shopify_historical_backfill_failed",
    }, { status: 500 });
  }
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
