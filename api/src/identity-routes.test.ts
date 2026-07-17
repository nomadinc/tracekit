import test from "node:test";
import assert from "node:assert/strict";
import {
  IDENTITY_RESOLVE_PATH,
  IDENTITY_REVIEW_PATH,
  matchIdentityRoute,
  normalizeApiPathname,
} from "./identity-routes.ts";

test("identity resolve route matches canonical POST handler", () => {
  const match = matchIdentityRoute("POST", "/v1/identity/resolve");
  assert.equal(match?.kind, "identity_resolve");
  assert.equal(match?.path, IDENTITY_RESOLVE_PATH);
  assert.deepEqual(match?.allowed_methods, ["POST"]);
});

test("identity resolve rejects GET before generic not_found fallback", () => {
  const match = matchIdentityRoute("GET", "/v1/identity/resolve");
  assert.equal(match?.kind, "method_not_allowed");
  assert.equal(match?.route, "identity_resolve");
  assert.deepEqual(match?.allowed_methods, ["POST"]);
});

test("identity resolve trailing slash behavior is deterministic", () => {
  assert.equal(normalizeApiPathname("/v1/identity/resolve/"), IDENTITY_RESOLVE_PATH);
  assert.equal(matchIdentityRoute("POST", "/v1/identity/resolve/")?.kind, "identity_resolve");
  assert.equal(matchIdentityRoute("GET", "/v1/identity/resolve/")?.kind, "method_not_allowed");
});

test("identity review route still matches GET", () => {
  const match = matchIdentityRoute("GET", "/v1/identity/review");
  assert.equal(match?.kind, "identity_review");
  assert.equal(match?.path, IDENTITY_REVIEW_PATH);
  assert.deepEqual(match?.allowed_methods, ["GET"]);
});
