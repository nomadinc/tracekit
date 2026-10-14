import assert from "node:assert/strict";
import test from "node:test";
import { canCompleteInvitation, invitationState, invitationTokenFromUrl, providerIdFromState } from "../lib/identity/invitation-onboarding";
const user = { id: "user_123", email: "customer@example.test", emailVerified: true };
const invitation = { id: "invitation_123", email: user.email, state: "accepted", organizationId: null, acceptedUserId: user.id, expiresAt: "2999-01-01" };
test("only a single bounded invitation token is accepted", () => {
  assert.equal(invitationTokenFromUrl(new URL("https://example.test/auth/sign-in")), null);
  assert.equal(invitationTokenFromUrl(new URL("https://example.test/auth/sign-in?invitation_token=valid_123")), "valid_123");
  for (const query of ["invitation_token=a&invitation_token=b", "invitation_token=", "invitation_token=%0A", `invitation_token=${"a".repeat(513)}`]) assert.throws(() => invitationTokenFromUrl(new URL(`https://example.test/?${query}`)));
});
test("sealed custom state carries only exact provider identity", () => {
  assert.equal(providerIdFromState(invitationState("invitation_123")), "invitation_123");
  for (const state of [undefined, "invalid", "null", '{}', '{"purpose":"other","providerId":"invitation_123"}', '{"purpose":"customer-invitation","providerId":"foreign"}']) assert.equal(providerIdFromState(state), null);
});
test("completion requires verified recipient and provider acceptance by the same user", () => {
  assert.equal(canCompleteInvitation(invitation, user), true);
  assert.equal(canCompleteInvitation({ ...invitation, email: "CUSTOMER@EXAMPLE.TEST" }, user), true);
  assert.equal(canCompleteInvitation(invitation, { ...user, emailVerified: false }), false);
  assert.equal(canCompleteInvitation(invitation, { ...user, email: "foreign@example.test" }), false);
  for (const change of [{ state: "pending" }, { state: "revoked" }, { state: "expired" }, { acceptedUserId: "foreign" }, { acceptedUserId: null }, { organizationId: "org_foreign" }]) assert.equal(canCompleteInvitation({ ...invitation, ...change }, user), false);
});
