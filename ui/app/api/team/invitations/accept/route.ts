import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveAuthenticatedPersistentIdentity } from "@/lib/identity/application-session";
import { assertInvitationAvailable, assertInvitationIdentity } from "@/lib/identity/team-management";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";

export async function POST(request: Request) {
  const identity = await resolveAuthenticatedPersistentIdentity();
  if (!identity) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  try {
    const body = await request.json().catch(() => null) as { invitationId?: unknown } | null;
    if (typeof body?.invitationId !== "string" || !body.invitationId) throw new Error("invitation_unavailable");
    const repository = new SupabaseTeamRepository();
    const invitation = await repository.invitationById(body.invitationId);
    if (!invitation) throw new Error("invitation_unavailable");
    assertInvitationAvailable(invitation);
    assertInvitationIdentity(invitation.intendedEmail, identity.user.primaryEmail);
    const member = await repository.acceptInvitation({
      invitationId: invitation.id,
      acceptedByUserId: identity.user.id,
      authenticatedIdentityId: identity.externalWorkosUserId,
      correlationId: randomUUID(),
    });
    return NextResponse.json({ member });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
