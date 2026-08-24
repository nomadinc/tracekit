import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";

type Row = Record<string, unknown>;

function configuration() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("order_storage_unavailable");
  return { url, key };
}

async function rest(path: string) {
  const { url, key } = configuration();
  const headers: Record<string, string> = { apikey: key, accept: "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, { cache: "no-store", headers });
  if (!response.ok) throw new Error(`order_storage_failed_${response.status}`);
  return response.json() as Promise<Row[]>;
}

export async function GET(req: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }

  try {
    requirePermission(resolution.session, "orders.view");
    const organizationId = resolution.session.activeOrganization?.id;
    if (!organizationId) throw new Error("order_scope_unavailable");

    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id")?.trim() || null;
    const search = url.searchParams.get("search")?.trim() || null;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 25), 1), 100);

    const filters = [
      `organization_id=eq.${encodeURIComponent(organizationId)}`,
      `workspace_id=eq.${encodeURIComponent(organizationId)}`,
    ];
    if (orderId) filters.push(`platform_order_id=eq.${encodeURIComponent(orderId)}`);
    if (search) {
      const safe = search.replace(/[,%()]/g, " ").trim();
      if (safe) filters.push(`or=(platform_order_id.ilike.*${encodeURIComponent(safe)}*,email.ilike.*${encodeURIComponent(safe)}*)`);
    }

    const select = [
      "id","platform","platform_order_id","workspace_id","organization_id","account_id","business_context_id","person_id",
      "everflow_transaction_id","everflow_offer_id","email","phone","order_ts","status","currency","gross_amount","product_subtotal",
      "shipping_amount","tax_amount","product_cost","shipping_cost","gateway_fee","chargeback_fee","tracking_number","shipping_carrier",
      "reconciliation_state","data_quality_state","raw"
    ].join(",");
    const path = `platform_orders?select=${select}&${filters.join("&")}&order=order_ts.desc&limit=${limit}`;
    const orders = await rest(path);
    return NextResponse.json({ ok: true, organization_id: organizationId, orders });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
