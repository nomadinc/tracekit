import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source=readFileSync(new URL("../lib/commerce/integration-experience-server.ts",import.meta.url),"utf8");

test("connections overview treats marketing provider discovery as optional",()=>{
 assert.match(source,/const marketingConnections = await optionalRows\(/);
 assert.doesNotMatch(source,/Promise\.all\(\[\s*commercePersistenceRequest\([^\]]*marketing_provider_connections/s);
});

test("connections overview isolates individual marketing adapter failures",()=>{
 assert.match(source,/Promise\.allSettled\(marketingConnections\.map/);
 assert.match(source,/item\.status === "fulfilled"/);
});

test("commerce connections remain authoritative in overview",()=>{
 assert.ok(source.includes("const connections = await commercePersistenceRequest("));
 assert.ok(source.includes("commerce_provider_connections?organization_id="));
 assert.ok(source.includes("connections: [...experiences, ...marketingExperiences]"));
});
