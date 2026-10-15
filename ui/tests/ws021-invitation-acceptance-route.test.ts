import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

test("explicit invitation acceptance selects only the organization returned by persisted acceptance", async () => {
  let allowed = true;
  let verified = true;
  const calls: Record<string, unknown>[] = [];
  class Repository {
    async customerInvitation(parameters: Record<string, unknown>) {
      calls.push(parameters);
      return { ok: allowed && parameters.p_email_verified === true, organizationId: "accepted-organization" };
    }
  }
  const output = await build({ entryPoints: [new URL("../app/api/invitations/route.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "route-mocks", setup(b) {
    b.onResolve({ filter: /application-session|supabase-identity-repository|workos-invitation-delivery|active-organization-cookie|next\/server/ }, args => ({ path: args.path.split("/").pop()!, external: true }));
  } }] });
  const mocks: Record<string, unknown> = {
    "application-session": { resolveAuthenticatedPersistentIdentity: async () => ({ user: { id: "persistent-user", status: "active" }, externalWorkosUserId: "provider-user", emailVerified: verified }) },
    "supabase-identity-repository": { SupabaseIdentityTenancyRepository: Repository },
    "workos-invitation-delivery": {},
    "active-organization-cookie": { ACTIVE_ORGANIZATION_COOKIE: "active-org", sealActiveOrganization: (payload: unknown) => JSON.stringify(payload) },
    server: { NextResponse: { json: (body: unknown, options?: {status?: number}) => ({ body, status: options?.status ?? 200, cookies: { values: [] as unknown[], set(...args: unknown[]) { this.values.push(args); } } }) } },
  };
  const bundledModule = { exports: {} as any };
  runInNewContext(output.outputFiles[0].text, { module: bundledModule, exports: bundledModule.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), process: {env: {NODE_ENV: "production"}}, URL, Date, console });
  const request = (extra = {}) => new Request("https://app.example.test/api/invitations", { method: "POST", headers: {origin: "https://app.example.test", "content-type": "application/json"}, body: JSON.stringify({ operation: "accept", invitationId: "invitation", ...extra }) });
  const success = await bundledModule.exports.POST(request());
  assert.equal(success.status, 200);
  const [name, value, options] = success.cookies.values[0];
  assert.equal(name, "active-org");
  assert.equal(JSON.parse(value).userId, "persistent-user");
  assert.equal(JSON.parse(value).organizationId, "accepted-organization");
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(success.cookies.values[1][2].maxAge, 0);
  allowed = false;
  const denied = await bundledModule.exports.POST(request());
  assert.equal(denied.status, 404);
  assert.equal(denied.cookies.values.length, 0);
  allowed = true; verified = false;
  assert.equal((await bundledModule.exports.POST(request())).status, 404);
  const count = calls.length;
  assert.equal((await bundledModule.exports.POST(request({ organizationId: "foreign" }))).status, 404);
  assert.equal(calls.length, count);
});
