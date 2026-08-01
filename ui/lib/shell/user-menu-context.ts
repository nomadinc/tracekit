import type { BusinessContext, IdentitySession, Organization, ShellVariant } from "../identity/types";

export type UserMenuContext = {
  accountType: string;
  role: string;
  activeAgency: string | null;
  activeOrganization: string | null;
  activeBusinessContext: string | null;
  platformScope: string | null;
};

export function userMenuContext(session: IdentitySession, organizations: Organization[], businessContexts: BusinessContext[], variant: ShellVariant): UserMenuContext {
  const organization = organizations.find((item) => item.id === session.activeOrganizationId) || null;
  const businessContext = businessContexts.find((item) => item.id === session.activeBusinessContextId) || null;
  return {
    accountType: session.identity.membership.accountType,
    role: session.identity.membership.role,
    activeAgency: variant === "agency" ? session.identity.membership.accountName : null,
    activeOrganization: variant === "product-admin" ? null : organization?.name || null,
    activeBusinessContext: variant === "product-admin" ? null : businessContext?.name || null,
    platformScope: variant === "product-admin" ? "TraceKit Platform" : null,
  };
}
