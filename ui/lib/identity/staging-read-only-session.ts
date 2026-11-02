import { requireAuthorizationEvidence } from "./authorization-completeness";
import { randomUUID } from "node:crypto";
import { ROLE_PERMISSIONS, type Permission, type Role } from "./permissions";
import { serializeSessionForClient, type TraceKitSessionContext } from "./persistent-types";
import type { ApplicationSessionResolution } from "./application-session";
import { isMembershipEffective } from "./persistent-authorization";
import { ACTIVE_ORGANIZATION_COOKIE, readActiveOrganization } from "./active-organization-cookie";
import { ACTIVE_BUSINESS_CONTEXT_COOKIE, readActiveBusinessContext } from "./active-business-context-cookie";

const STAGING_ORIGIN = "https://staging.trace-kit.io";
const STAGING_DATABASE = "https://joahiwgidfbzwzyslrbq.supabase.co";
const STAGING_CLIENT = "client_01KZ1RW7ZH5X45Y1A8M3YAYDP5";
type SessionEnvironment = Record<string, string | undefined>;
const READ_PERMISSIONS: readonly string[] = [
  "organizations.view", "offers.view", "customers.view", "customers.view_sensitive_data",
  "orders.view", "orders.view_financials", "financials.view",
];

type Auth = { user?: { id: string; emailVerified?: boolean } | null; accessToken?: string; impersonator?: unknown };
type CookieJar = { get(name: string): { value: string } | undefined };
export type ReadOnlySessionDependencies = {
  authenticate(): Promise<Auth>;
  cookieJar(): Promise<CookieJar>;
  fetch: typeof fetch;
  env?: SessionEnvironment;
  now?: () => number;
  organizationId?: string;
};

function authorityEndpoint(env: SessionEnvironment) {
  if (env.TRACEKIT_REPORTING_MODE !== "restricted-staging" || env.VERCEL_ENV !== "preview"
    || env.WORKOS_CLIENT_ID !== STAGING_CLIENT || !env.WORKOS_API_KEY
    || !env.WORKOS_COOKIE_PASSWORD || env.WORKOS_COOKIE_PASSWORD.length < 32
    || env.REPORTING_SUPABASE_URL !== STAGING_DATABASE
    || env.WORKOS_REDIRECT_URI !== `${STAGING_ORIGIN}/auth/callback`
    || env.NEXT_PUBLIC_WORKOS_REDIRECT_URI !== `${STAGING_ORIGIN}/auth/callback`
    || env.WORKOS_COOKIE_DOMAIN) throw new Error("staging_session_configuration_unavailable");
  const url = new URL(env.REPORTING_AUTHORITY_URL || "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || url.pathname !== "/" || url.port || url.hostname === "localhost"
    || url.hostname === "app.trace-kit.io" || url.hostname.endsWith(".supabase.co")) {
    throw new Error("staging_session_configuration_unavailable");
  }
  return new URL("/v1/session", url).href;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_session");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("invalid_session");
  return value;
}
function timestamp(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("invalid_session");
  return value;
}

// The authority is responsible for verified WorkOS JWTs and live protected
// registry reads. The UI has no database credential and accepts no browser roles.
export function projectReadOnlySession(value: unknown, subject: string, now: number): TraceKitSessionContext {
  const data = object(value);
  const issuedAt = timestamp(data.issuedAt);
  const expiresAt = timestamp(data.expiresAt);
  if (data.version !== 1 || data.subject !== subject || !text(data.membershipVersion)
    || issuedAt > now || now - issuedAt > 60_000 || expiresAt <= now
    || expiresAt - issuedAt > 60_000 || expiresAt <= issuedAt) throw new Error("invalid_session");
  const u = object(data.user), a = object(data.account), o = object(data.organization), m = object(data.membership);
  const userId = text(u.id), accountId = text(a.id), organizationId = text(o.id);
  const role = text(m.role) as Role;
  if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)
    || ["platform-owner", "platform-admin", "support", "billing", "read-only-operations"].includes(role)
    || u.workosUserId !== subject || u.status !== "active" || a.status !== "active"
    || !["client", "agency"].includes(String(a.accountType))
    || o.status !== "active" || o.accountId !== accountId || m.accountId !== accountId || m.userId !== userId
    || m.organizationId !== organizationId || data.workspaceId !== organizationId
    || m.status !== "active") throw new Error("invalid_session");
  const membership = {
    id: text(m.id), userId, accountId, organizationId, role, status: "active" as const,
    effectiveFrom: text(m.effectiveFrom), effectiveUntil: m.effectiveUntil === null ? null : text(m.effectiveUntil),
  };
  if (!isMembershipEffective(membership, now)) throw new Error("invalid_session");
  requireAuthorizationEvidence(data.authorizationEvidence, { subject, userId, organizationId, membershipId: membership.id, membershipVersion: text(data.membershipVersion) });
  if (!Array.isArray(data.permissions) || data.permissions.length > READ_PERMISSIONS.length
    || data.permissions.some(p => typeof p !== "string" || !READ_PERMISSIONS.includes(p))) throw new Error("invalid_session");
  if (new Set(data.permissions).size !== data.permissions.length) throw new Error("invalid_session");
  const permissions = Array.from(new Set(data.permissions)) as Permission[];
  if (!permissions.includes("customers.view")) throw new Error("invalid_session");
  if (!Array.isArray(data.businessContexts) || !data.businessContexts.length || data.businessContexts.length > 50) throw new Error("invalid_session");
  const contexts = data.businessContexts.map(value => {
    const c = object(value);
    if (c.organizationId !== organizationId) throw new Error("invalid_session");
    return { id: text(c.id), organizationId, name: text(c.name), mark: text(c.mark, 16) };
  });
  if (new Set(contexts.map(c => c.id)).size !== contexts.length
    || !contexts.some(c => c.id === data.activeBusinessContextId)) throw new Error("invalid_session");
  const organization = { id: organizationId, accountId, name: text(o.name), mark: text(o.mark, 16) };
  if (!Array.isArray(data.availableOrganizations) || !data.availableOrganizations.length || data.availableOrganizations.length > 50) throw new Error("invalid_session");
  const availableOrganizations = data.availableOrganizations.map(value => {
    const entry = object(value);
    if (entry.status !== "active") throw new Error("invalid_session");
    return { id: text(entry.id), accountId: text(entry.accountId), name: text(entry.name), mark: text(entry.mark,16) };
  });
  if (new Set(availableOrganizations.map(o => o.id)).size !== availableOrganizations.length
    || !availableOrganizations.some(o => o.id === organizationId && o.accountId === accountId)) throw new Error("invalid_session");
  return {
    user: { id: userId, workosUserId: subject, primaryEmail: text(u.primaryEmail), displayName: text(u.displayName), avatarUrl: null, status: "active" },
    externalWorkosUserId: subject,
    activeAccount: { id: accountId, name: text(a.name), accountType: a.accountType as "client" | "agency", status: "active" },
    activeAgency: null, activeOrganization: organization, availableOrganizations,
    membership, role, effectivePermissions: permissions, permissionOverrides: [],
    accessibleBusinessContexts: contexts, activeBusinessContextId: data.activeBusinessContextId as string,
    assurance: { authenticationMethod: null, impersonated: false }, correlationId: randomUUID(),
  };
}

export async function resolveReadOnlyStagingSession(deps: ReadOnlySessionDependencies): Promise<ApplicationSessionResolution> {
  const env = deps.env || process.env, clock = deps.now || Date.now;
  try {
    const endpoint = authorityEndpoint(env); // Validate before reading auth or sending tokens.
    const auth = await deps.authenticate();
    if (!auth.user) return { kind: "unauthenticated" };
    if (!auth.user.emailVerified || auth.impersonator || !auth.accessToken) return { kind: "no-membership" };
    const readSession = async (organizationId?: string) => {
      const url = new URL(endpoint);
      if (organizationId) url.searchParams.set("organization_id", organizationId);
      const response = await deps.fetch(url.href, {
        method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { accept: "application/json", authorization: `Bearer ${auth.accessToken}` },
      });
      if (!response.ok) return { denied: [401,403,404].includes(response.status) };
      const session = projectReadOnlySession(await response.json(), auth.user!.id, clock());
      if (organizationId && session.activeOrganization!.id !== organizationId) throw new Error("invalid_session");
      return { session };
    };
    const initial = await readSession(deps.organizationId);
    if (!initial.session) return { kind: initial.denied ? "no-membership" : "provider-unavailable" };
    let session = initial.session;
    const jar = await deps.cookieJar();
    const organization = deps.organizationId || readActiveOrganization(jar.get(ACTIVE_ORGANIZATION_COOKIE)?.value, session.user.id, clock());
    if (organization && organization !== session.activeOrganization!.id) {
      if (!session.availableOrganizations.some(o => o.id === organization)) return { kind: "no-membership" };
      const next = await readSession(organization);
      if (!next.session || next.session.user.id !== session.user.id) return { kind: "no-membership" };
      session = next.session;
    }
    const context = deps.organizationId ? null : readActiveBusinessContext(jar.get(ACTIVE_BUSINESS_CONTEXT_COOKIE)?.value, session.user.id, session.activeOrganization!.id, clock());
    if (context) {
      if (!session.accessibleBusinessContexts.some(c => c.id === context)) return { kind: "no-membership" };
      session.activeBusinessContextId = context;
    }
    return {
      kind: "authenticated", session, clientSession: serializeSessionForClient(session),
      legacySession: {
        authenticated: true, developmentOnly: false,
        identity: { id: session.user.id, name: session.user.displayName, email: session.user.primaryEmail, title: session.role,
          membership: { id: session.membership.id, accountId: session.activeAccount.id, accountName: session.activeAccount.name,
            accountType: session.activeAccount.accountType, role: session.role, organizationIds: [session.activeOrganization!.id],
            grants: session.effectivePermissions,
            denials: ROLE_PERMISSIONS[session.role].filter(p => !session.effectivePermissions.includes(p)) } },
        activeOrganizationId: session.activeOrganization!.id, activeBusinessContextId: session.activeBusinessContextId, adminClientView: false,
      },
    };
  } catch {
    // No response bodies, tokens or provider exception messages are logged.
    return { kind: "provider-unavailable" };
  }
}
