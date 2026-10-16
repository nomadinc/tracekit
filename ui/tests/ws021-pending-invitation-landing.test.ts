import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

test("accepted recipient lands home using current membership time, while pending and inactive recipients do not", async () => {
  let memberships = [{ status: "active", effectiveFrom: new Date(Date.now() - 60000).toISOString(), effectiveUntil: null }];
  let invitations: { id: string }[] = [];
  let verified = true;
  const output = await build({ entryPoints: [new URL("../app/invitations/page.tsx", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", plugins: [{name:"landing-mocks",setup(b) {
    b.onResolve({filter:/application-session|supabase-identity-repository|next\/navigation|next\/link/},args=>({path:args.path.split("/").pop()!,external:true}));
  }}] });
  const mocks: Record<string, unknown> = {
    "application-session": { resolveAuthenticatedPersistentIdentity: async () => ({ user: {id:"recipient",primaryEmail:"recipient@example.invalid",status:"active"},emailVerified:verified,repository:{membershipsForUser:async()=>memberships} }) },
    "supabase-identity-repository": { SupabaseIdentityTenancyRepository: class {async pendingInvitationsForVerifiedEmail(){return invitations;}} },
    navigation: { redirect: (path:string) => {throw new Error(`redirect:${path}`);} },
    link: () => null,
  };
  const mod={exports:{} as any};
  runInNewContext(output.outputFiles[0].text,{module:mod,exports:mod.exports,require:(name:string)=>name in mocks?mocks[name]:nativeRequire(name),Date,console,process:{env:{NODE_ENV:"production"}}});
  await assert.rejects(()=>mod.exports.default(),/redirect:\/$/);
  invitations=[{id:"pending"}];
  assert.ok(await mod.exports.default());
  invitations=[];
  memberships=[{status:"suspended",effectiveFrom:new Date(Date.now()-60000).toISOString(),effectiveUntil:null}];
  assert.ok(await mod.exports.default());
  memberships=[{status:"active",effectiveFrom:new Date(Date.now()+60000).toISOString(),effectiveUntil:null}];
  assert.ok(await mod.exports.default());
  memberships=[];
  assert.ok(await mod.exports.default());
  verified=false;
  assert.ok(await mod.exports.default());
});
