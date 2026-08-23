import { randomUUID } from "node:crypto";
import type { PersistentUser } from "./persistent-types";
import { SupabaseIdentityTenancyRepository } from "./supabase-identity-repository";

export async function recordScopedAuthenticationSuccess(input: {
  user: PersistentUser;
  authenticatedIdentityId: string;
}) {
  const repository = new SupabaseIdentityTenancyRepository();
  const memberships = await repository.membershipsForUser(input.user.id);
  const membership = memberships.find((candidate) => candidate.organizationId) || memberships[0] || null;

  let accountId = membership?.accountId ?? null;
  let organizationId = membership?.organizationId ?? null;

  if (membership?.organizationId && !accountId) {
    const organizations = await repository.organizationsForMembership(membership, null);
    accountId = organizations[0]?.owningAccountId ?? null;
    organizationId = organizations[0]?.id ?? membership.organizationId;
  }

  await repository.recordAuditEvent({
    actorUserId: input.user.id,
    authenticatedIdentityId: input.authenticatedIdentityId,
    accountId,
    organizationId,
    action: "authentication.sign_in.succeeded",
    result: "success",
    correlationId: randomUUID(),
    metadata: {
      provider: "workos",
      role: membership?.role ?? null,
      membership_status: membership?.status ?? null,
    },
  });
}
