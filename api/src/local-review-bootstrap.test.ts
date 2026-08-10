import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../scripts/bootstrap-local-review-tenant.sql", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../scripts/bootstrap-local-review-tenant.sh", import.meta.url), "utf8");
const docs = readFileSync(new URL("../../docs/development/LOCAL_AUTHENTICATED_REVIEW_TENANT.md", import.meta.url), "utf8");

test("local authenticated review bootstrap resolves rather than creates a WorkOS user", () => {
  assert.match(sql, /where workos_user_id = :'workos_user_id'/);
  assert.doesNotMatch(sql, /insert into public\.tracekit_users/i);
  assert.match(sql, /Expected exactly one synchronized TraceKit user/);
});

test("local review tenant uses stable fixture identity and idempotent conflict keys", () => {
  assert.match(sql, /70000000-0000-0000-0000-000000000001/);
  assert.match(sql, /70000000-0000-0000-0000-000000000002/);
  assert.match(sql, /offer-bullseye/);
  assert.match(sql, /on conflict \(user_id, organization_id\) where organization_id is not null do update/);
  assert.match(sql, /on conflict \(user_id, account_id\) where account_id is not null do update/);
  assert.match(sql, /on conflict \(membership_id, organization_id, business_context_id\) do update/);
});

test("local review identity has explicit platform membership and narrow Product/Admin entitlements", () => {
  assert.match(sql, /account_type, name, status[\s\S]*'platform', 'TraceKit Local Product Review'/);
  assert.match(sql, /role\.role_key = 'platform-admin'/);
  assert.match(sql, /'admin\.manage_feature_access', 'allow'/);
  assert.match(sql, /'investigation'/);
  assert.match(sql, /'tkid_origin_registry'/);
  assert.match(sql, /70000000-0000-0000-0000-000000000008/);
});

test("local bootstrap remains separate from production migrations and documents post-login restore", () => {
  assert.match(shell, /bootstrap-local-review-tenant\.sql/);
  assert.match(docs, /complete one WorkOS login/);
  assert.match(docs, /never creates a user/i);
  assert.doesNotMatch(sql, /api[_ -]?key|password|token|secret_ciphertext/i);
});
