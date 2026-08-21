import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requireTeamPermission } from "@/lib/identity/team-api";
import { TEAM_ROLES_BY_ACCOUNT_TYPE } from "@/lib/identity/team-management";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";

export async function GET() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
  try {
    const scope = requireTeamPermission(resolution.session, "users.view");
    const repository = new SupabaseTeamRepository();
    const members = await repository.listMembers(scope);
    return NextResponse.json({
      members,
      roles: TEAM_ROLES_BY_ACCOUNT_TYPE[scope.accountType],
      scope: { accountType: scope.accountType, organizationScoped: Boolean(scope.organizationId) },
    });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
