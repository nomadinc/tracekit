"use client";

import * as React from "react";
import { accessibleBusinessContexts, accessibleOrganizations, normalizeSession, shellVariant } from "@/lib/identity/authorization";
import { developmentIdentityById, developmentSessionFor, resolveDevelopmentIdentity, withDevelopmentIdentity } from "@/lib/identity/development-state";
import { DEVELOPMENT_IDENTITY_STORAGE_KEY } from "@/lib/identity/session";
import type { BusinessContext, IdentitySession, Organization, ShellVariant } from "@/lib/identity/types";

type IdentityContextValue = {
  session: IdentitySession;
  organizations: Organization[];
  businessContexts: BusinessContext[];
  variant: ShellVariant;
  setDevelopmentIdentity: (identityId: string) => void;
  setActiveOrganization: (organizationId: string) => void;
  setActiveBusinessContext: (contextId: string) => void;
};

const defaultIdentity = resolveDevelopmentIdentity();
const defaultSession = developmentSessionFor(defaultIdentity);
const IdentityContext = React.createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState(defaultSession);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const identity = resolveDevelopmentIdentity(params.get("dev_identity"), window.localStorage.getItem(DEVELOPMENT_IDENTITY_STORAGE_KEY));
      window.localStorage.setItem(DEVELOPMENT_IDENTITY_STORAGE_KEY, identity.id);
      setSession((current) => developmentSessionFor(identity, current));
      setReady(true);
    }
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const setDevelopmentIdentity = React.useCallback((identityId: string) => {
    const identity = developmentIdentityById(identityId);
    if (!identity) return;
    window.localStorage.setItem(DEVELOPMENT_IDENTITY_STORAGE_KEY, identity.id);
    window.history.replaceState(window.history.state, "", withDevelopmentIdentity(`${window.location.pathname}${window.location.search}${window.location.hash}`, identity.id));
    setSession((current) => developmentSessionFor(identity, current));
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

  return (
    <IdentityContext.Provider value={value}>
      {ready ? children : <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">Preparing development identity…</div>}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const value = React.useContext(IdentityContext);
  if (!value) throw new Error("useIdentity must be used inside IdentityProvider");
  return value;
}
