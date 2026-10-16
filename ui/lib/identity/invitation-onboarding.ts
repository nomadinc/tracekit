type ProviderInvitation = { id: string; email: string; state: string; organizationId: string | null; acceptedUserId: string | null; expiresAt: string };
export function invitationTokenFromUrl(url: URL): string | null {
  const tokens = url.searchParams.getAll("invitation_token");
  if (!tokens.length) return null;
  if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{1,512}$/.test(tokens[0])) throw new Error("Invitation unavailable");
  return tokens[0];
}
export function invitationState(providerId: string): string {
  return JSON.stringify({ purpose: "customer-invitation", providerId });
}
export function providerIdFromState(state: string | undefined): string | null {
  if (!state) return null;
  try {
    const value = JSON.parse(state);
    return value?.purpose === "customer-invitation" && typeof value.providerId === "string" && /^invitation_[A-Za-z0-9]+$/.test(value.providerId) ? value.providerId : null;
  } catch { return null; }
}
export function canCompleteInvitation(invitation: ProviderInvitation, user: { id: string; email: string; emailVerified: boolean }): boolean {
  return user.emailVerified && invitation.organizationId === null && invitation.state === "accepted" && invitation.acceptedUserId === user.id && invitation.email.trim().toLowerCase() === user.email.trim().toLowerCase();
}
