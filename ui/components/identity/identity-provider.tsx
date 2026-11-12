"use client";

import * as React from "react";
import { accessibleBusinessContexts, accessibleOrganizations, normalizeSession, shellVariant } from "@/lib/identity/authorization";
import { developmentIdentityById, developmentSessionFor, resolveDevelopmentIdentity, resolveDevelopmentIdentityRequest, withDevelopmentIdentity } from "@/lib/identity/development-state";
import { DEVELOPMENT_IDENTITY_STORAGE_KEY } from "@/lib/identity/session";
import type { BusinessContext, IdentitySession, Organization, ShellVariant } from "@/lib/identity/types";
import { identityProviderInitialization } from "@/lib/identity/identity-mode";

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

export function IdentityProvider({ children, initialSession, persistentOrganizations = [], persistentBusinessContexts = [] }: { children: React.ReactNode; initialSession?: IdentitySession; persistentOrganizations?: Organization[]; persistentBusinessContexts?: BusinessContext[] }) {
  const initialization = identityProviderInitialization(initialSession);
  const persistent = initialization.persistent;
  const initializeDevelopment = initialization.initializeDevelopment;
  const [session, setSession] = React.useState(initialSession || defaultSession);
  const [ready, setReady] = React.useState(initialization.ready);
  const switchInFlight = React.useRef(false);
  const [switching, setSwitching] = React.useState(false);
  const [switchError, setSwitchError] = React.useState<string | null>(null);
  const [invalidExplicitIdentity, setInvalidExplicitIdentity] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!persistent || !initialSession) return;
    setSession(initialSession);
  }, [persistent, initialSession]);

  React.useEffect(() => {
    if (!initializeDevelopment) return;
    function syncFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const resolution = resolveDevelopmentIdentityRequest(params.get("dev_identity"), window.localStorage.getItem(DEVELOPMENT_IDENTITY_STORAGE_KEY));
      setInvalidExplicitIdentity(resolution.invalidExplicitId);
      const identity = resolution.identity;
      if (!identity) {
        setReady(true);
        return;
      }
      window.localStorage.setItem(DEVELOPMENT_IDENTITY_STORAGE_KEY, identity.id);
      setSession((current) => developmentSessionFor(identity, current));
      setReady(true);
    }
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [initializeDevelopment]);

  const setDevelopmentIdentity = React.useCallback((identityId: string) => {
    if (persistent) return;
    const identity = developmentIdentityById(identityId);
    if (!identity) return;
    setInvalidExplicitIdentity(null);
    window.localStorage.setItem(DEVELOPMENT_IDENTITY_STORAGE_KEY, identity.id);
    window.history.replaceState(window.history.state, "", withDevelopmentIdentity(`${window.location.pathname}${window.location.search}${window.location.hash}`, identity.id));
    setSession((current) => developmentSessionFor(identity, current));
  }, [persistent]);

  const switchPersistentSession = React.useCallback(async (path: string, body: Record<string, string>) => {
    // Serialize switches and hide the old workspace until the server session is
    // authoritative again. Never normalize persistent IDs with mock catalogs.
    if (switchInFlight.current) return;
    switchInFlight.current = true;
    setSwitchError(null);
    setSwitching(true);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(path === "/api/session/business-context" ? "Business context switch denied" : "Organization switch denied");
      // Reload this same validated application destination. The server resolves
      // membership, permissions, and accessible context catalogs together.
      window.location.reload();
    } catch {
      switchInFlight.current = false;
      setSwitching(false);
      setSwitchError("Unable to confirm workspace switch. Refresh to reload your authorized session.");
    }
  }, []);

  const setActiveOrganization = React.useCallback((organizationId: string) => {
    if (persistent) {
      void switchPersistentSession("/api/session/organization", { organizationId });
      return;
    }
    setSession((current) => normalizeSession({ ...current, activeOrganizationId: organizationId, activeBusinessContextId: null }));
  }, [persistent, switchPersistentSession]);

  const setActiveBusinessContext = React.useCallback((contextId: string) => {
    if (persistent) {
      void switchPersistentSession("/api/session/business-context", { businessContextId: contextId });
      return;
    }
    setSession((current) => normalizeSession({ ...current, activeBusinessContextId: contextId }));
  }, [persistent, switchPersistentSession]);

  const organizations = React.useMemo(() => persistent ? persistentOrganizations : accessibleOrganizations(session.identity), [persistent, persistentOrganizations, session.identity]);
  const businessContexts = React.useMemo(() => persistent ? persistentBusinessContexts.filter((context) => context.organizationId === session.activeOrganizationId) : accessibleBusinessContexts(session.identity, session.activeOrganizationId), [persistent, persistentBusinessContexts, session.identity, session.activeOrganizationId]);
  const value = React.useMemo<IdentityContextValue>(() => ({ session, organizations, businessContexts, variant: session.adminClientView ? "client" : shellVariant(session.identity), setDevelopmentIdentity, setActiveOrganization, setActiveBusinessContext }), [session, organizations, businessContexts, setDevelopmentIdentity, setActiveOrganization, setActiveBusinessContext]);

  return (
    <IdentityContext.Provider value={value}>
      {switchError ? <p role="alert" className="border-b border-red-200 bg-red-50 p-3 text-sm text-red-900">{switchError}</p> : null}
      {switching ? <div role="status" className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">Loading authorized workspace…</div> : !ready ? <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">Preparing development identity…</div> : invalidExplicitIdentity ? <div role="alert" className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-slate-900"><div className="max-w-lg rounded-xl border bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Development identity error</p><h1 className="mt-2 text-lg font-semibold">Unknown development identity</h1><p className="mt-2 text-sm text-slate-600"><code>dev_identity={invalidExplicitIdentity}</code> is not a registered review identity. No fallback user was selected.</p></div></div> : children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const value = React.useContext(IdentityContext);
  if (!value) throw new Error("useIdentity must be used inside IdentityProvider");
  return value;
}
