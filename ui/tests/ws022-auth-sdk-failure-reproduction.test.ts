import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
function request(url:string,cookie="") { const r=new Request(url); return Object.assign(r,{cookies:{get:(name:string)=>{const v=cookie.split("; ").find(x=>x.startsWith(name+"="));return v?{value:v.slice(name.length+1)}:undefined;}}}); }
import { sealData } from "iron-session";
import { authErrorDiagnostic } from "../lib/identity/auth-error-diagnostic";

test("real AuthKit callback distinguishes missing cookie, state mismatch and expired sealed state without provider calls", async () => {
  const saved = process.env.WORKOS_COOKIE_PASSWORD;
  process.env.WORKOS_COOKIE_PASSWORD = "synthetic-password-for-tests-only-123456789";
  const bundled=await build({entryPoints:["node_modules/@workos-inc/authkit-nextjs/dist/esm/authkit-callback-route.js"],bundle:true,write:false,platform:"node",format:"esm",packages:"external",plugins:[{name:"unreachable-session-seam",setup(b){
    b.onResolve({filter:/^\.\/session\.js$/},()=>({path:"session",namespace:"synthetic"}));
    b.onLoad({filter:/.*/,namespace:"synthetic"},()=>({contents:'export async function saveSession(){throw new Error("Unexpected session save")}',loader:"js"}));
  }}]});
  const modulePath=resolve(`node_modules/.ws022-sdk-${crypto.randomUUID()}.mjs`);
  await writeFile(modulePath,bundled.outputFiles[0].text);
  const {handleAuth}=await import(modulePath); await unlink(modulePath);
  let error:unknown;
  const handler = handleAuth({onError: async (value: unknown) => {error=value;return new Response("denied",{status:400});}});
  const originalFetch=globalThis.fetch, originalLog=console.error;
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error("Provider network must not be called");};
  console.error=()=>{};
  try {
    const missing=await handler(request("https://synthetic.invalid/auth/callback?code=synthetic&state=synthetic"));
    assert.equal(missing.status,400);
    assert.equal(authErrorDiagnostic(error).code,"missing_pkce_cookie");
    const mismatch=await handler(request("https://synthetic.invalid/auth/callback?code=synthetic&state=synthetic","wos-auth-verifier=other-synthetic-state"));
    assert.equal(mismatch.status,400);
    assert.equal(authErrorDiagnostic(error).code,"oauth_state_mismatch");
    const now=Date.now;
    let expired:string;
    try { Date.now=()=>now()-900_000; expired=await sealData({codeVerifier:"synthetic-verifier"},{password:process.env.WORKOS_COOKIE_PASSWORD,ttl:600}); }
    finally { Date.now=now; }
    const expiry=await handler(request(`https://synthetic.invalid/auth/callback?code=synthetic&state=${encodeURIComponent(expired!)}`,`wos-auth-verifier=${expired!}`));
    assert.equal(expiry.status,400);
    assert.equal(authErrorDiagnostic(error).code,"unclassified");
    assert.equal(authErrorDiagnostic(error).category,"state_unseal_or_schema_rejected"); // Present expired seal is distinct from absent cookie; category is not expiry-only.
    assert.equal(calls,0);
  } finally {globalThis.fetch=originalFetch;console.error=originalLog;if(saved===undefined)delete process.env.WORKOS_COOKIE_PASSWORD;else process.env.WORKOS_COOKIE_PASSWORD=saved;}
});
