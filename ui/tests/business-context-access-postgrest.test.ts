import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("business-context access uses the explicit composite FK in PostgREST", () => {
  const source = readFileSync(new URL("../lib/identity/supabase-identity-repository.ts", import.meta.url), "utf8");
  assert.match(source, /tracekit_business_contexts!tracekit_business_context_access_context_fk!inner\(id,organization_id,name,status\)/);
});
