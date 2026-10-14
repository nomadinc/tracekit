import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { invitationState } from "../lib/identity/invitation-onboarding";
const nativeRequire = createRequire(import.meta.url);
async function loadRoute(path: string, mocks: Record<string, unknown>) {
  const result = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", external: ["@workos-inc/authkit-nextjs", "next/server", "next/headers", "@/lib/identity/active-organization-cookie", "@/lib/identity/application-session", "@/lib/identity/supabase-identity-repository"] });
  const module = { exports: {} as any };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), Response, URL, process: { env: { NODE_ENV: "production" } }, console: { error() {} } });
  return module.exports;
}
test("sign-in forwards the token while retaining SDK PKCE URL and sealed invitation identity", async () => {
  let options: any;
  const route = await loadRoute("../app/auth/sign-in/route.ts", {
    "@workos-inc/authkit-nextjs": { getSignInUrl: async (value: any) => { options = value; return "https://auth.example.test/authorize?state=sdk-sealed&code_challenge=pkce"; }, getWorkOS: () => ({ userManagement: { findInvitationByToken: async () => ({ id: "invitation_123", email: "customer@example.test", state: "pending", organizationId: null, expiresAt: "2999-01-01" }) } }) },
    "next/server": { NextResponse: { redirect: (url: URL) => new Response(null, { status: 307, headers: { location: String(url) } }), json: (body: any, init: any) => Response.json(body, init) } },
  });
  const response = await route.GET(new Request("https://app.example.test/auth/sign-in?invitation_token=invite123&returnTo=https://evil.test"));
  const url = new URL(response.headers.get("location"));
  assert.equal(url.searchParams.get("invitation_token"), "invite123");
  assert.equal(url.searchParams.get("state"), "sdk-sealed");
  assert.equal(url.searchParams.get("code_challenge"), "pkce");
  assert.equal(options.returnTo, "/invitations");
  assert.equal(options.state, invitationState("invitation_123"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("callback accepts only the exact persisted invite and skips impersonated or unrelated sign-ins", async () => {
  const calls: any[] = [];
  const selected: any[] = [];
  class Repository {
    async userByWorkOSId() { return { id: "persistent-user" }; }
    async invitationIdForProvider(providerId: string, email: string) { calls.push({ providerId, email }); return "tracekit-invite"; }
    async customerInvitation(value: any) { calls.push(value); return { ok: true, organizationId: "invited-organization" }; }
  }
  const route = await loadRoute("../app/auth/callback/route.ts", {
    "@workos-inc/authkit-nextjs": { handleAuth: (options: any) => options, getWorkOS: () => ({ userManagement: { getInvitation: async () => ({ id: "invitation_123", email: "customer@example.test", state: "accepted", organizationId: null, acceptedUserId: "user_123" }) } }) },
    "@/lib/identity/application-session": { recordAuthenticationSuccess: async () => {} },
    "@/lib/identity/supabase-identity-repository": { SupabaseIdentityTenancyRepository: Repository },
    "next/headers": { cookies: async () => ({ set: (...args: any[]) => selected.push(args) }) },
    "@/lib/identity/active-organization-cookie": { ACTIVE_ORGANIZATION_COOKIE: "active-organization", sealActiveOrganization: (value: any) => JSON.stringify(value) },
    "next/server": { NextResponse: { redirect: (url: URL) => {
      const response = new Response(null, { status: 307, headers: { location: String(url) } }) as Response & { cookies: unknown };
      response.cookies = { set() {} };
      return response;
    } } },
  });
  const input = { user: { id: "user_123", email: "customer@example.test", emailVerified: true }, state: invitationState("invitation_123") };
  await route.GET.onSuccess(input);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].p_operation, "accept");
  assert.equal(calls[1].p_invitation_id, "tracekit-invite");
  assert.equal(calls[1].p_actor_id, "persistent-user");
  assert.equal(calls[1].p_email_verified, true);
  assert.equal(calls[1].p_context_ids, undefined);
  assert.equal(selected.length, 1);
  assert.equal(JSON.parse(selected[0][1]).organizationId, "invited-organization");
  assert.equal(JSON.parse(selected[0][1]).userId, "persistent-user");
  assert.equal(selected[0][2].httpOnly, true);
  selected.length = 0;
  calls.length = 0;
  await route.GET.onSuccess({ ...input, impersonator: { email: "admin@example.test" } });
  await route.GET.onSuccess({ ...input, state: undefined });
  await route.GET.onSuccess({ ...input, user: { ...input.user, emailVerified: false } });
  assert.equal(calls.length, 0);
  assert.equal(selected.length, 0);
  const request = { url: "https://app.example.test/auth/callback?code=rejected&state=untrusted", cookies: { has: () => false } };
  const recovered = await route.GET.onError({ error: { code: "missing_pkce_cookie" }, request });
  assert.equal(recovered.status, 307);
  assert.equal(recovered.headers.get("location"), "https://app.example.test/auth/sign-in?returnTo=%2Finvitations");
  const stopped = await route.GET.onError({ error: { code: "missing_pkce_cookie" }, request: { ...request, cookies: { has: () => true } } });
  assert.equal(stopped.status, 400);
  assert.match(await stopped.text(), /Continue to TraceKit/);
  const mismatch = await route.GET.onError({ error: { code: "state_mismatch" }, request });
  assert.equal(mismatch.status, 400);
});
