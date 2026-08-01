"use client";

import * as React from "react";
import { accessibleBusinessContexts, accessibleOrganizations, normalizeSession, shellVariant } from "@/lib/identity/authorization";
import { DEFAULT_DEVELOPMENT_IDENTITY_ID, MOCK_IDENTITIES } from "@/lib/identity/mock";
import { DEVELOPMENT_IDENTITY_STORAGE_KEY } from "@/lib/identity/session";
import type { BusinessContext, Identity, IdentitySession, Organization, ShellVariant } from "@/lib/identity/types";

type IdentityContextValue = {
  session: IdentitySession;
  organizations: Organization[];
  businessContexts: BusinessContext[];
  variant: ShellVariant;
  setDevelopmentIdentity: (identityId: string) => void;
  setActiveOrganization: (organizationId: string) => void;
  setActiveBusinessContext: (contextId: string) => void;
};

function sessionFor(identity: Identity, current?: IdentitySession): IdentitySession {
  return normalizeSession({
    authenticated: true,
    developmentOnly: true,
    identity,
    activeOrganizationId: current?.activeOrganizationId || null,
    activeBusinessContextId: current?.activeBusinessContextId || null,
  });
}

const defaultIdentity = MOCK_IDENTITIES.find((identity) => identity.id === DEFAULT_DEVELOPMENT_IDENTITY_ID) || MOCK_IDENTITIES[0];
const defaultSession = sessionFor(defaultIdentity);
const IdentityContext = React.createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState(defaultSession);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("dev_identity") || window.localStorage.getItem(DEVELOPMENT_IDENTITY_STORAGE_KEY);
    const identity = MOCK_IDENTITIES.find((candidate) => candidate.id === requested);
    if (identity) setSession((current) => sessionFor(identity, current));
  }, []);

  const setDevelopmentIdentity = React.useCallback((identityId: string) => {
    const identity = MOCK_IDENTITIES.find((candidate) => candidate.id === identityId);
    if (!identity) return;
    window.localStorage.setItem(DEVELOPMENT_IDENTITY_STORAGE_KEY, identity.id);
    setSession((current) => sessionFor(identity, current));
  }, []);

  const setActiveOrganization = React.useCallback((organizationId: string) => {
    setSession((current) => normalizeSession({ ...current, activeOrganizationId: organizationId, activeBusinessContextId: null }));
  }, []);

  const setActiveBusinessContext = React.useCallback((contextId: string) => {
    setSession((current) => normalizeSession({ ...current, activeBusinessContextId: contextId }));
  }, []);

  const organizations = React.useMemo(() => accessibleOrganizations(session.identity), [session.identity]);
  const businessContexts = React.useMemo(() => accessibleBusinessContexts(session.identity, session.activeOrganizationId), [session.identity, session.activeOrganizationId]);
  const value = React.useMemo<IdentityContextValue>(() => ({ session, organizations, businessContexts, variant: shellVariant(session.identity), setDevelopmentIdentity, setActiveOrganization, setActiveBusinessContext }), [session, organizations, businessContexts, setDevelopmentIdentity, setActiveOrganization, setActiveBusinessContext]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  const value = React.useContext(IdentityContext);
  if (!value) throw new Error("useIdentity must be used inside IdentityProvider");
  return value;
}
