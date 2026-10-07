import test from "node:test";
import assert from "node:assert/strict";
import { signedOutReturnUrl } from "../lib/identity/auth-return-url";
const production = { NODE_ENV: "production", NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://app.trace-kit.io/auth/callback" } as NodeJS.ProcessEnv;
test("production logout supplies an absolute same-origin signed-out destination", () => {
  assert.equal(signedOutReturnUrl("https://app.trace-kit.io/auth/sign-out?returnTo=https://evil.example", production), "https://app.trace-kit.io/auth/signed-out");
});
test("preview authentication keeps its explicitly configured deployment origin", () => {
  const host = "tracekit-git-feature-tenancy-team-invitations-tracekit.vercel.app";
  assert.equal(signedOutReturnUrl(`https://${host}/auth/sign-out`, { ...production, VERCEL_BRANCH_URL: host }), `https://${host}/`);
});
test("untrusted origins, credentials and protocol downgrade cannot become return destinations", () => {
  for (const url of ["https://evil.example/auth/sign-out", "https://tracekit-evil.vercel.app/auth/sign-out", "https://user:password@app.trace-kit.io/auth/sign-out", "http://app.trace-kit.io/auth/sign-out"]) assert.throws(() => signedOutReturnUrl(url, production));
});
test("local development remains available without authorizing production localhost", () => {
  assert.equal(signedOutReturnUrl("http://localhost:3000/auth/sign-out", { NODE_ENV: "development" }), "http://localhost:3000/auth/signed-out");
  assert.throws(() => signedOutReturnUrl("http://localhost:3000/auth/sign-out", production));
});

test("a stale preview callback configuration cannot redirect a production logout", () => {
  assert.equal(signedOutReturnUrl("https://app.trace-kit.io/auth/sign-out", { ...production, NEXT_PUBLIC_WORKOS_REDIRECT_URI: "https://tracekit-git-feature-tenancy-team-invitations-tracekit.vercel.app/auth/callback" }), "https://app.trace-kit.io/auth/signed-out");
});
