/** Enable only after the tenant-invitation migration is verified on this environment's database. */
export function tenantInvitationsEnabled() {
  return process.env.TRACEKIT_TENANT_INVITATIONS_ENABLED === "true";
}
