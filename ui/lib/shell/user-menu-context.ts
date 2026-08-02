import type { BusinessContext, IdentitySession, Organization, ShellVariant } from "../identity/types";

export type UserMenuContext = {
  accountType: string;
  role: string;
  activeAgency: string | null;
  activeOrganization: string | null;
  activeBusinessContext: string | null;
  platformScope: string | null;
};

export type UserMenuSignOutAction =
  | { kind: "navigate"; label: "Sign Out"; href: "/auth/sign-out" }
  | { kind: "placeholder"; label: "Sign Out — placeholder"; description: string };

export function userMenuSignOutAction(session: IdentitySession): UserMenuSignOutAction {
  if (!session.developmentOnly) {
    return { kind: "navigate", label: "Sign Out", href: "/auth/sign-out" };
  }

  return {
    kind: "placeholder",
    label: "Sign Out — placeholder",
    description: "Real sign-out is unavailable because this session uses development-only mock identity state.",
  };
}

export function runUserMenuSignOut(
  action: UserMenuSignOutAction,
  handlers: {
    closeMenu: () => void;
    navigate: (href: string) => void;
    openPlaceholder: (title: string, description: string) => void;
  },
) {
  handlers.closeMenu();
  if (action.kind === "navigate") {
    handlers.navigate(action.href);
    return;
  }
  handlers.openPlaceholder(action.label, action.description);
}

export function shouldShowDevelopmentIdentityNotice(
  session: IdentitySession,
): boolean {
  return session.developmentOnly;
}

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
