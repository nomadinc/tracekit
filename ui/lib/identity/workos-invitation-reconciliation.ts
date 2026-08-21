import { randomUUID } from "node:crypto";
import { SupabaseTeamRepository } from "./supabase-team-repository";
import { listWorkOSInvitationsByEmail } from "./workos-invitations";

export async function reconcileAcceptedWorkOSInvitations(input: {
  tracekitUserId: string;
  workosUserId: string;
  email: string;
}) {
  const repository = new SupabaseTeamRepository();
  const workosInvitations = await listWorkOSInvitationsByEmail(input.email);
  const accepted = workosInvitations.filter((invitation) => invitation.state === "accepted" && invitation.acceptedUserId === input.workosUserId);
  let reconciled = 0;

  for (const delivery of accepted) {
    const invitation = await repository.invitationByWorkOSId(delivery.id);
    if (!invitation || invitation.status !== "pending") continue;
    await repository.acceptInvitation({ invitationId: invitation.id, acceptedByUserId: input.tracekitUserId, authenticatedIdentityId: input.workosUserId, correlationId: randomUUID() });
    reconciled++;
  }

  return reconciled;
}
