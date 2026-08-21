import assert from "node:assert/strict";
import test from "node:test";
import {
  TeamManagementError,
  assertInvitationAvailable,
  assertInvitationIdentity,
  assertInvitationStatusTransition,
  assertMembershipStatusTransition,
  assertOwnerMutationAllowed,
  normalizeInvitationEmail,
  requireRoleForAccountType,
} from "../lib/identity/team-management";

test("invitation email is normalized and invalid input is rejected", () => {
  assert.equal(normalizeInvitationEmail("  Owner@Example.COM "), "owner@example.com");
  assert.throws(() => normalizeInvitationEmail("not-an-email"), (error) => error instanceof TeamManagementError && error.code === "invalid_email");
});

test("roles cannot cross tenancy account types", () => {
  assert.equal(requireRoleForAccountType("agency", "agency-admin"), "agency-admin");
  assert.equal(requireRoleForAccountType("client", "organization-owner"), "organization-owner");
  assert.throws(() => requireRoleForAccountType("client", "platform-owner"), (error) => error instanceof TeamManagementError && error.code === "invalid_role");
  assert.throws(() => requireRoleForAccountType("agency", "organization-admin"), (error) => error instanceof TeamManagementError && error.code === "invalid_role");
});

test("removed memberships cannot be silently reactivated", () => {
  assert.doesNotThrow(() => assertMembershipStatusTransition("suspended", "active"));
  assert.doesNotThrow(() => assertMembershipStatusTransition("active", "removed"));
  assert.throws(() => assertMembershipStatusTransition("removed", "active"), (error) => error instanceof TeamManagementError && error.code === "invalid_transition");
});

test("accepted, revoked, and expired invitations are terminal", () => {
  assert.doesNotThrow(() => assertInvitationStatusTransition("pending", "accepted"));
  for (const status of ["accepted", "revoked", "expired"] as const) {
    assert.throws(() => assertInvitationStatusTransition(status, "pending"), (error) => error instanceof TeamManagementError && error.code === "invalid_transition");
  }
});

test("invitation acceptance requires the authenticated email", () => {
  assert.doesNotThrow(() => assertInvitationIdentity("Owner@Example.com", "owner@example.com"));
  assert.throws(() => assertInvitationIdentity("owner@example.com", "other@example.com"), (error) => error instanceof TeamManagementError && error.code === "identity_mismatch");
});

test("revoked and expired invitations cannot be accepted", () => {
  const now = new Date("2026-08-21T17:00:00Z");
  assert.doesNotThrow(() => assertInvitationAvailable({ status: "pending", expiresAt: "2026-08-22T17:00:00Z" }, now));
  assert.throws(() => assertInvitationAvailable({ status: "revoked", expiresAt: "2026-08-22T17:00:00Z" }, now), (error) => error instanceof TeamManagementError && error.code === "invitation_unavailable");
  assert.throws(() => assertInvitationAvailable({ status: "pending", expiresAt: "2026-08-20T17:00:00Z" }, now), (error) => error instanceof TeamManagementError && error.code === "invitation_unavailable");
});

test("the final owner cannot be demoted, suspended, or removed", () => {
  for (const mutation of [
    { nextRole: "organization-admin" as const },
    { nextStatus: "suspended" as const },
    { nextStatus: "removed" as const },
  ]) {
    assert.throws(
      () => assertOwnerMutationAllowed({ accountType: "client", currentRole: "organization-owner", activeOwnerCount: 1, ...mutation }),
      (error) => error instanceof TeamManagementError && error.code === "final_owner",
    );
  }
  assert.doesNotThrow(() => assertOwnerMutationAllowed({ accountType: "client", currentRole: "organization-owner", nextRole: "organization-admin", activeOwnerCount: 2 }));
});

test("final-owner protection applies independently to platform and agency owners", () => {
  assert.throws(
    () => assertOwnerMutationAllowed({ accountType: "platform", currentRole: "platform-owner", nextStatus: "removed", activeOwnerCount: 1 }),
    (error) => error instanceof TeamManagementError && error.code === "final_owner",
  );
  assert.throws(
    () => assertOwnerMutationAllowed({ accountType: "agency", currentRole: "agency-owner", nextRole: "agency-admin", activeOwnerCount: 1 }),
    (error) => error instanceof TeamManagementError && error.code === "final_owner",
  );
});
