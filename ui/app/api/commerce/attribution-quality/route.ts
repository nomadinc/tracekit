import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";
import { readCommasAttributionQuality, type QualityFilters } from "@/lib/commerce/attribution-quality-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return NextResponse.json({ error: "resource_unavailable" }, { status: 404 });
    requirePermission(resolution.session, "connectors.view");
    const url = new URL(request.url);
    const allowed = new Set(["provider", "from", "to", "comparison", "alias", "ord", "derivation"]);
    const enumValues: Record<string, string[]> = { comparison: ["exact_match", "partial_match", "conflict", "no_everflow_record", "no_commas_tid", "not_evaluated"], alias: ["all_agree", "single_alias", "conflict", "none"], ord: ["exact", "unmatched", "ambiguous", "malformed"], derivation: ["live", "reconciled"] };
    if (Array.from(url.searchParams.keys()).some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)
      || (url.searchParams.has("provider") && url.searchParams.get("provider") !== "commas")
      || ["from", "to"].some(key => url.searchParams.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(key) || ""))
      || Object.entries(enumValues).some(([key, values]) => url.searchParams.has(key) && !values.includes(url.searchParams.get(key) || ""))) return NextResponse.json({ error: "unsupported_filter" }, { status: 400 });
    const filters: QualityFilters = {};
    for (const key of ["from", "to", "comparison", "alias", "ord"] as const) if (url.searchParams.has(key)) filters[key] = url.searchParams.get(key)!;
    if (url.searchParams.has("derivation")) filters.derivation = url.searchParams.get("derivation") as "live" | "reconciled";
    const data = await readCommasAttributionQuality(resolution.session.activeOrganization.id, filters);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return NextResponse.json({ error: "resource_unavailable" }, { status: 404 });
    return NextResponse.json({ error: "report_unavailable" }, { status: 503 });
  }
}
