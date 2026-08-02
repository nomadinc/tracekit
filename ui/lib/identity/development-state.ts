import { DEFAULT_DEVELOPMENT_IDENTITY_ID, MOCK_IDENTITIES } from "./mock";
import type { Identity, IdentitySession } from "./types";
import { normalizeSession } from "./authorization";

export function developmentIdentityById(identityId: string | null | undefined): Identity | null {
  return MOCK_IDENTITIES.find((identity) => identity.id === identityId) || null;
}

export function resolveDevelopmentIdentity(queryIdentityId?: string | null, persistedIdentityId?: string | null): Identity {
  return developmentIdentityById(queryIdentityId)
    || developmentIdentityById(persistedIdentityId)
    || developmentIdentityById(DEFAULT_DEVELOPMENT_IDENTITY_ID)
    || MOCK_IDENTITIES[0];
}

export type DevelopmentIdentityResolution = {
  identity: Identity | null;
  invalidExplicitId: string | null;
};

export function resolveDevelopmentIdentityRequest(
  queryIdentityId?: string | null,
  persistedIdentityId?: string | null,
): DevelopmentIdentityResolution {
  if (queryIdentityId !== null && queryIdentityId !== undefined && queryIdentityId !== "") {
    const explicit = developmentIdentityById(queryIdentityId);
    return explicit
      ? { identity: explicit, invalidExplicitId: null }
      : { identity: null, invalidExplicitId: queryIdentityId };
  }
  return {
    identity: resolveDevelopmentIdentity(null, persistedIdentityId),
    invalidExplicitId: null,
  };
}

export function developmentSessionFor(identity: Identity, current?: IdentitySession): IdentitySession {
  const preserveContext = current?.identity.id === identity.id;
  return normalizeSession({
    authenticated: true,
    developmentOnly: true,
    identity,
    activeOrganizationId: preserveContext ? current.activeOrganizationId : null,
    activeBusinessContextId: preserveContext ? current.activeBusinessContextId : null,
  });
}

export function withDevelopmentIdentity(href: string, identityId: string): string {
  if (!href.startsWith("/")) return href;
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [pathname, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("dev_identity", identityId);
  return `${pathname}?${params.toString()}${hash ? `#${hash}` : ""}`;
}
