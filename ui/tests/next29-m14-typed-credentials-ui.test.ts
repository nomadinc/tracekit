import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("M14.1B permits one active commerce credential per connection and type", () => {
  const migration = read("supabase/migrations/065_commerce_credentials_by_type.sql");
  assert.match(migration, /drop index if exists public\.commerce_provider_credentials_active_connection_uidx/);
  assert.match(migration, /\(connection_id, credential_type\)/);
  assert.match(migration, /where revoked_at is null/);
  assert.match(migration, /credential_type = p_credential_type/);
});

test("M14.1B webhook secret resolver uses encrypted connection-scoped storage only", () => {
  const resolver = read("ui/lib/commerce/next29-webhook-signing-secret.ts");
  const store = read("ui/lib/commerce/typed-credential-store.ts");
  assert.match(resolver, /credentialType: "webhook_signing_secret"/);
  assert.doesNotMatch(resolver, /TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET/);
  assert.match(store, /credential_type=eq\./);
  assert.match(store, /decryptCommerceCredential/);
  assert.match(store, /encryptCommerceCredential/);
  assert.doesNotMatch(store, /console\.(?:log|info|warn|error).*secret/i);
});

test("legacy commerce API credential lookup remains explicitly api_key scoped", () => {
  const repository = read("ui/lib/commerce/supabase-control-repository.ts");
  assert.match(
    repository,
    /activeCredential\(connectionId: string, organizationId: string\).*credential_type=eq\.api_key/,
    "Existing connector credential reads must remain api_key-scoped once multiple active credential types can coexist.",
  );
  assert.match(repository, /credential_type: "api_key"/);
  assert.match(repository, /p_credential_type: "api_key"/);
});
