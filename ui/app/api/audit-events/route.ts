import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { auditHistoryPagination, auditHistoryScope } from "@/lib/identity/audit-history";
import { SupabaseAuditHistoryRepository } from "@/lib/identity/supabase-audit-repository";

export async function GET(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  try {
    const scope = auditHistoryScope(resolution.session);
    const page = auditHistoryPagination(new URL(request.url).searchParams);
    const repository = new SupabaseAuditHistoryRepository();
    const result = scope.platformWide
      ? await repository.listForAccount(scope.accountId, page.limit, page.cursor)
      : await repository.listForOrganization(scope.organizationId, page.limit, page.cursor);
    return NextResponse.json({ ...result, scope: scope.platformWide ? "platform_account" : "active_organization" });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
