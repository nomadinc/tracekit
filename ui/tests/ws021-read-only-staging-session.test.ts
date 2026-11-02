import assert from "node:assert/strict";
import test from "node:test";
import { restrictedIdentityBoundary } from "../lib/identity/staging-session-boundary";
import { build } from "esbuild";
import { resolveReadOnlyStagingSession } from "../lib/identity/staging-read-only-session";
import { sealActiveOrganization, ACTIVE_ORGANIZATION_COOKIE } from "../lib/identity/active-organization-cookie";
import { sealActiveBusinessContext, ACTIVE_BUSINESS_CONTEXT_COOKIE } from "../lib/identity/active-business-context-cookie";

const sources = ["tracekit_users","tracekit_memberships","tracekit_roles","tracekit_accounts","tracekit_organizations","tracekit_permission_overrides","tracekit_business_context_access","tracekit_business_contexts"];
const now = 1_800_000_000_000;
const env = {
  TRACEKIT_REPORTING_MODE: "restricted-staging", VERCEL_ENV: "preview",
  WORKOS_CLIENT_ID: "client_01KZ1RW7ZH5X45Y1A8M3YAYDP5", WORKOS_API_KEY: "offline-only",
  WORKOS_COOKIE_PASSWORD: "offline-cookie-secret-with-at-least-32-characters",
  WORKOS_REDIRECT_URI: "https://staging.trace-kit.io/auth/callback",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://staging.trace-kit.io/auth/callback",
  REPORTING_SUPABASE_URL: "https://joahiwgidfbzwzyslrbq.supabase.co",
  REPORTING_AUTHORITY_URL: "https://authority-staging.example.test",
};
function fixture() {
  return {
    authorizationEvidence: {version:1,contract:"postgrest-exact-authorization-v1",scope:{subject:"user_workos_test",userId:"app-user-test",organizationId:"org-alpha",membershipId:"membership-test",membershipVersion:"protected-registry-v3"},reads:[...sources,...sources,"current_memberships","current_memberships"].map(source=>({source,total:1,returned:1}))},
    version: 1, subject: "user_workos_test", membershipVersion: "protected-registry-v3",
    issuedAt: now - 1000, expiresAt: now + 40_000, workspaceId: "org-alpha",
    user: { id: "app-user-test", workosUserId: "user_workos_test", primaryEmail: "test@example.test", displayName: "Test", status: "active" },
    account: { id: "account-alpha", name: "Alpha", accountType: "client", status: "active" },
    organization: { id: "org-alpha", accountId: "account-alpha", name: "Alpha", mark: "A", status: "active" },
    membership: { id: "membership-test", userId: "app-user-test", accountId: "account-alpha", organizationId: "org-alpha",
      role: "client-read-only", status: "active", effectiveFrom: new Date(now - 10_000).toISOString(), effectiveUntil: null as string | null },
    permissions: ["customers.view", "orders.view"],
    businessContexts: [{ id: "context-alpha", organizationId: "org-alpha", name: "Alpha Test", mark: "AT" }],
    activeBusinessContextId: "context-alpha",
    availableOrganizations: [{ id: "org-alpha", accountId: "account-alpha", name: "Alpha", mark: "A", status: "active" }],
  };
}
const auth = { user: { id: "user_workos_test", emailVerified: true }, accessToken: "offline-workos-token" };
async function resolve(data: unknown = fixture(), options: { env?: Record<string, string | undefined>; status?: number; auth?: typeof auth; cookies?: Record<string, string> } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await resolveReadOnlyStagingSession({
    env: options.env || env, now: () => now, authenticate: async () => options.auth || auth,
    cookieJar: async () => ({ get: key => options.cookies?.[key] ? { value: options.cookies[key] } : undefined }),
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return Response.json(data, { status: options.status || 200 }); },
  });
  return { result, calls };
}

test("authorized existing login resolves through GET only without inferred role grants", async () => {
  const { result, calls } = await resolve();
  assert.equal(result.kind, "authenticated");
  if (result.kind !== "authenticated") return;
  assert.equal(result.session.user.id, "app-user-test");
  assert.equal(result.session.role, "client-read-only");
  assert.deepEqual(result.session.effectivePermissions, ["customers.view", "orders.view"]);
  assert.ok(result.legacySession.identity.membership.denials?.includes("financials.view"));
  assert.equal(result.clientSession.assurance.impersonated, false);
  assert.equal("externalWorkosUserId" in result.clientSession, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://authority-staging.example.test/v1/session");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.redirect, "error");
  assert.equal(new Headers(calls[0].init?.headers).get("x-tk-secret"), null);
});
test("revoked and missing memberships deny without fallback", async () => {
  for (const status of [401, 403, 404]) assert.equal((await resolve({}, { status })).result.kind, "no-membership");
  for (const status of ["removed", "suspended", "invited"]) {
    const data = fixture(); data.membership.status = status;
    assert.equal((await resolve(data)).result.kind, "provider-unavailable");
  }
});
test("missing, capped or conflicting authority completeness evidence cannot create a session",async()=>{
 const missing=fixture() as any;delete missing.authorizationEvidence;
 assert.equal((await resolve(missing)).result.kind,"provider-unavailable");
 for(const source of ["tracekit_memberships","tracekit_permission_overrides"]){
  const data=fixture();data.authorizationEvidence.reads.find(r=>r.source===source)!.total=2;
  assert.equal((await resolve(data)).result.kind,"provider-unavailable");
 }
 const duplicate=fixture();duplicate.permissions.push("orders.view");assert.equal((await resolve(duplicate)).result.kind,"provider-unavailable");
});
test("stale, future and overlong membership assertions deny", async () => {
  for (const dates of [{ issuedAt: now - 70_000 }, { expiresAt: now }, { issuedAt: now + 1 }, { expiresAt: now + 61_000 }]) {
    assert.equal((await resolve({ ...fixture(), ...dates })).result.kind, "provider-unavailable");
  }
  const data = fixture(); data.membership.effectiveUntil = new Date(now - 1).toISOString();
  assert.equal((await resolve(data)).result.kind, "provider-unavailable");
});
test("foreign subject, application identity, tenant, account and business context deny", async () => {
  const mutations = [
    (d: ReturnType<typeof fixture>) => { d.subject = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.user.workosUserId = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.membership.userId = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.workspaceId = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.membership.organizationId = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.organization.accountId = "foreign"; },
    (d: ReturnType<typeof fixture>) => { d.businessContexts[0].organizationId = "foreign"; },
  ];
  for (const mutate of mutations) { const data = fixture(); mutate(data); assert.equal((await resolve(data)).result.kind, "provider-unavailable"); }
});
test("foreign organization or business-context selection cannot substitute scope", async () => {
  const original = process.env.WORKOS_COOKIE_PASSWORD;
  process.env.WORKOS_COOKIE_PASSWORD = env.WORKOS_COOKIE_PASSWORD;
  try {
    const organization = sealActiveOrganization({ userId: "app-user-test", organizationId: "org-beta", expiresAt: now + 10_000 });
    assert.equal((await resolve(fixture(), { cookies: { [ACTIVE_ORGANIZATION_COOKIE]: organization } })).result.kind, "no-membership");
    const context = sealActiveBusinessContext({ userId: "app-user-test", organizationId: "org-alpha", businessContextId: "context-beta", expiresAt: now + 10_000 });
    assert.equal((await resolve(fixture(), { cookies: { [ACTIVE_BUSINESS_CONTEXT_COOKIE]: context } })).result.kind, "no-membership");
  } finally { if (original === undefined) delete process.env.WORKOS_COOKIE_PASSWORD; else process.env.WORKOS_COOKIE_PASSWORD = original; }
});
test("missing configuration and production targeting stop before token transmission", async () => {
  for (const key of Object.keys(env)) {
    const missing: Record<string, string | undefined> = { ...env }; delete missing[key];
    const { result, calls } = await resolve(fixture(), { env: missing });
    assert.equal(result.kind, "provider-unavailable", key); assert.equal(calls.length, 0, key);
  }
  for (const patch of [{ VERCEL_ENV: "production" }, { REPORTING_SUPABASE_URL: "https://uoeosoiegatlqtzemsfv.supabase.co" },
    { WORKOS_COOKIE_DOMAIN: ".trace-kit.io" }, { REPORTING_AUTHORITY_URL: "https://app.trace-kit.io" },
    { REPORTING_AUTHORITY_URL: "http://authority-staging.example.test" }, { REPORTING_AUTHORITY_URL: "https://authority-staging.example.test/path" }]) {
    const { result, calls } = await resolve(fixture(), { env: { ...env, ...patch } });
    assert.equal(result.kind, "provider-unavailable"); assert.equal(calls.length, 0);
  }
});
test("unverified email and missing access token deny without authority requests", async () => {
  for (const changed of [{ ...auth, accessToken: "" }, { ...auth, user: { ...auth.user, emailVerified: false } }]) {
    const { result, calls } = await resolve(fixture(), { auth: changed });
    assert.equal(result.kind, "no-membership"); assert.equal(calls.length, 0);
  }
});
test("mutation or platform permissions and roles cannot enter read-only sessions", async () => {
  for (const permission of ["users.invite", "admin.impersonate", "actions.execute", "unknown"]) {
    const data = fixture(); data.permissions.push(permission);
    assert.equal((await resolve(data)).result.kind, "provider-unavailable");
  }
  const data = fixture(); data.membership.role = "platform-owner";
  assert.equal((await resolve(data)).result.kind, "provider-unavailable");
});
test("refresh and re-login re-read membership rather than reusing an assertion", async () => {
  assert.equal((await resolve()).result.kind, "authenticated");
  assert.equal((await resolve({}, { status: 403 })).result.kind, "no-membership");
});
test("signed organization selection is revalidated against the authority before switching scope", async () => {
  const original = process.env.WORKOS_COOKIE_PASSWORD;
  process.env.WORKOS_COOKIE_PASSWORD = env.WORKOS_COOKIE_PASSWORD;
  const alpha = fixture(), beta = fixture();
  const organization = { id: "org-beta", accountId: "account-beta", name: "Beta", mark: "B", status: "active" };
  alpha.availableOrganizations.push(organization); beta.availableOrganizations.push(organization);
  beta.authorizationEvidence.scope.organizationId="org-beta";
  beta.account.id = "account-beta"; beta.organization = organization;
  beta.membership.accountId = "account-beta"; beta.membership.organizationId = "org-beta"; beta.workspaceId = "org-beta";
  beta.businessContexts = [{ id: "context-beta", organizationId: "org-beta", name: "Beta", mark: "B" }]; beta.activeBusinessContextId = "context-beta";
  const cookie = sealActiveOrganization({ userId: "app-user-test", organizationId: "org-beta", expiresAt: now + 10_000 });
  let calls = 0;
  try {
    const result = await resolveReadOnlyStagingSession({ env, now: () => now, authenticate: async () => auth,
      cookieJar: async () => ({ get: key => key === ACTIVE_ORGANIZATION_COOKIE ? { value: cookie } : undefined }),
      fetch: async (input, init) => { calls++; assert.equal(init?.method,"GET"); return Response.json(new URL(String(input)).searchParams.get("organization_id") === "org-beta" ? beta : alpha); } });
    assert.equal(result.kind,"authenticated"); if (result.kind === "authenticated") assert.equal(result.session.activeOrganization?.id,"org-beta");
    assert.equal(calls,2);
  } finally { if (original === undefined) delete process.env.WORKOS_COOKIE_PASSWORD; else process.env.WORKOS_COOKIE_PASSWORD=original; }
});
test("provider failures never expose error text or trigger a second transport", async () => {
  let calls = 0;
  const result = await resolveReadOnlyStagingSession({ env, authenticate: async () => auth, cookieJar: async () => ({ get: () => undefined }),
    fetch: async () => { calls++; throw new Error("sensitive provider diagnostic"); } });
  assert.deepEqual(result, { kind: "provider-unavailable" }); assert.equal(calls, 1);
});
test("WS-001 boundary fences Preview and remains opt-in elsewhere", () => {
  assert.equal(restrictedIdentityBoundary({}), false);
  assert.equal(restrictedIdentityBoundary({ VERCEL_ENV: "preview" }), true);
});

test("real application entrypoints bypass every legacy repository and callback write in restricted mode", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const state = { repositories: 0, auth: { ...auth, user: null as typeof auth.user | null }, cookieReads: 0 };
  (globalThis as any).__ws021 = state;
  const output = await build({ entryPoints: [new URL("../lib/identity/application-session.ts", import.meta.url).pathname],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [{ name: "offline-session-dependencies", setup(builder) {
      builder.onResolve({ filter: /^@workos-inc\/authkit-nextjs$|^next\/headers$|supabase-identity-repository$|platform-catalog-access$/ }, args => ({ path: args.path, namespace: "offline" }));
      builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents:
        args.path.includes("authkit") ? "export async function withAuth(){ return globalThis.__ws021.auth }" :
        args.path.includes("next/headers") ? "export async function headers(){return new Headers()} export async function cookies(){globalThis.__ws021.cookieReads++;return {get:()=>undefined,has:()=>false}}" :
        args.path.includes("platform-catalog") ? "export async function requirePersistedPlatformAccess(){throw Error('unexpected platform call')}" :
        "export class SupabaseIdentityTenancyRepository {constructor(){globalThis.__ws021.repositories++;throw Error('unexpected repository')}}", loader: "js" }));
    } }] });
  try {
    Object.assign(process.env, env);
    const app = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
    assert.deepEqual(await app.resolveApplicationSession(), { kind: "unauthenticated" });
    state.auth = auth;
    globalThis.fetch = async () => { const data = fixture(); data.membership.effectiveFrom = new Date(Date.now() - 10_000).toISOString();
      return Response.json({ ...data, issuedAt: Date.now() - 1000, expiresAt: Date.now() + 40_000 }); };
    assert.equal((await app.resolveApplicationSession()).kind, "authenticated");
    assert.equal(await app.recordAuthenticationSuccess({ id: auth.user.id, email: "test@example.test" }), undefined);
    assert.equal(state.repositories, 0); // Silent callback completion performs no persistence.
    globalThis.fetch = async () => Response.json({}, { status: 403 });
    assert.deepEqual(await app.resolveApplicationSession(), { kind: "no-membership" }); // Callback cannot grant access.
    await assert.rejects(app.synchronizeWorkOSUser({ id: auth.user.id, email: "test@example.test" }), /identity synchronization is disabled/);
    assert.equal(await app.resolveAuthenticatedPersistentIdentity(), null);
    assert.equal(state.repositories, 0);
    delete process.env.TRACEKIT_REPORTING_MODE;
    process.env.VERCEL_ENV = "production";
    state.auth = { ...auth, user: null };
    assert.deepEqual(await app.resolveApplicationSession(), { kind: "unauthenticated" });
    assert.equal(state.repositories, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv); delete (globalThis as any).__ws021;
  }
});

test("organization POST writes only signed cookies after authority approval and denies foreign requests", async () => {
  const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
  const state = { repositories:0, writes:[] as Array<[string,unknown,unknown]>, denied:false, incomplete:false };
  (globalThis as any).__ws021Switch = state;
  const result = await build({ entryPoints:[new URL("../app/api/session/organization/route.ts",import.meta.url).pathname], bundle:true,platform:"node",format:"esm",write:false,
    plugins:[{name:"offline-switch",setup(builder){
      builder.onResolve({filter:/^@workos-inc\/authkit-nextjs$|^next\/headers$|^next\/server$|supabase-identity-repository$/},args=>({path:args.path,namespace:"switch"}));
      builder.onLoad({filter:/.*/,namespace:"switch"},args=>({contents:
        args.path.includes("authkit")?`export async function withAuth(){return ${JSON.stringify(auth)}}`:
        args.path==="next/server"?'export const NextResponse={json:(...args)=>Response.json(...args)}':
        args.path==="next/headers"?'export async function headers(){return new Headers()} export async function cookies(){return {get:()=>undefined,has:()=>false,delete:(k)=>globalThis.__ws021Switch.writes.push([k,null,null]),set:(...a)=>globalThis.__ws021Switch.writes.push(a)}}':
        "export class SupabaseIdentityTenancyRepository{constructor(){globalThis.__ws021Switch.repositories++;throw Error('legacy repository')}}",loader:"js"}));
    }}]});
  try {
    Object.assign(process.env,env);
    globalThis.fetch=async(input,init)=>{ assert.equal(init?.method,"GET");assert.equal(new URL(String(input)).searchParams.get("organization_id"),"org-alpha");
      const data=fixture(); data.issuedAt=Date.now()-1000;data.expiresAt=Date.now()+40_000;data.membership.effectiveFrom=new Date(Date.now()-10_000).toISOString();
      if(state.incomplete)delete (data as any).authorizationEvidence;
      return state.denied?Response.json({},{status:403}):Response.json(data);};
    const route=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
    const request=(origin:string)=>new Request("https://staging.trace-kit.io/api/session/organization",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({organizationId:"org-alpha"})});
    assert.equal((await route.POST(request("https://staging.trace-kit.io"))).status,200);
    assert.equal(state.writes.length,2); assert.equal((state.writes[1][2] as any).secure,true); assert.equal((state.writes[1][2] as any).httpOnly,true);
    state.writes=[];state.incomplete=true;
    assert.equal((await route.POST(request("https://staging.trace-kit.io"))).status,404);assert.equal(state.writes.length,0);
    state.incomplete=false;state.denied=true;
    assert.equal((await route.POST(request("https://staging.trace-kit.io"))).status,404);
    assert.equal((await route.POST(request("https://foreign.example.test"))).status,404);
    assert.equal(state.writes.length,0);assert.equal(state.repositories,0);
  } finally { globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);delete (globalThis as any).__ws021Switch; }
});
