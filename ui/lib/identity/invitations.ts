export type InvitationState = { id: string; intendedEmail: string; status: "pending" | "accepted" | "expired" | "revoked"; expiresAt: string; targetAccountId: string | null; targetOrganizationId: string | null; requestedRole: string; acceptedByUserId: string | null };

export function validateInvitationAcceptance(invitation: InvitationState, authenticatedEmail: string, now = new Date()) {
  if (invitation.status !== "pending") return { accepted: false as const, reason: invitation.status === "accepted" ? "already_accepted" : "unavailable" };
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) return { accepted: false as const, reason: "expired" };
  if (invitation.intendedEmail.trim().toLowerCase() !== authenticatedEmail.trim().toLowerCase()) return { accepted: false as const, reason: "identity_mismatch" };
  if (!invitation.targetAccountId && !invitation.targetOrganizationId) return { accepted: false as const, reason: "invalid_target" };
  return { accepted: true as const, reason: null };
}
