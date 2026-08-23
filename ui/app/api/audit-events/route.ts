import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { auditHistoryScope } from "@/lib/identity/audit-history";
import { SupabaseAuditHistoryRepository } from "@/lib/identity/supabase-audit-repository";

export async function GET() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
  try {
    const scope = auditHistoryScope(resolution.session);
    const repository = new SupabaseAuditHistoryRepository();
    const events = scope.platformWide
      ? await repository.listForAccount(scope.accountId)
      : await repository.listForOrganization(scope.organizationId);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
