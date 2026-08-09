import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAS_CAPABILITIES, PROVIDER_CATALOG } from "../lib/commerce/integration-experience";
import { navigationForIdentity } from "../lib/identity/shell-navigation";
import { MOCK_IDENTITIES } from "../lib/identity/mock";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const component = read("components/connections/integration-experience.tsx");
const route = read("app/api/commerce/[...commercePath]/route.ts");

test("Connections overview preserves the approved commerce provider roadmap", () => { assert.deepEqual(PROVIDER_CATALOG.map((provider) => provider.name), ["Commas", "Shopify", "Checkout Champ", "WooCommerce", "Next29", "Sticky.io"]); assert.equal(PROVIDER_CATALOG.filter((provider) => provider.availability === "available").length, 1); });
test("Commas capability presentation preserves verified limitations", () => { assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Products")?.state, "limited"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Refunds")?.state, "embedded"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Chargebacks / Disputes")?.state, "webhook_only"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Attribution identifiers")?.state, "unavailable"); });
test("Connection experience never renders credential or evidence secrets", () => { for (const forbidden of ["secret_ciphertext", "secret_iv", "storage_reference", "COMMAS_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) assert.equal(component.includes(forbidden), false); assert.match(component, /type="password"/); });
test("credential flow never echoes the submitted API key", () => { assert.doesNotMatch(component, /setNotice\([^)]*apiKey/); assert.match(component, /target\.reset\(\)/); });
test("commerce mutation route always uses structured JSON envelopes", () => { assert.match(route, /NextResponse\.json/); assert.match(route, /code: "internal_error"|"internal_error"/); assert.match(route, /x-tracekit-request-id/); assert.doesNotMatch(route, /new Response\(null/); });
test("commerce mutations enforce same-origin requests and persistent sessions", () => { assert.match(route, /sameOrigin\(request\)/); assert.match(route, /resolution\.kind !== "authenticated"/); assert.doesNotMatch(route, /dev_identity/); });
test("Shadow Sync remains visibly disabled until the worker exists", () => { assert.match(component, /Start Shadow Sync/); assert.match(component, /Shadow ingestion is not enabled yet/); assert.doesNotMatch(route, /createSyncRun|claimSyncRun/); });
test("readiness is loaded server-side and cannot be posted by the browser", () => { assert.doesNotMatch(route, /readinessEvidence|live_beta/); assert.match(read("lib/commerce/integration-experience-server.ts"), /readiness_evidence/); });
test("client bundle has no service-role, crypto, verifier, persistence, or Evidence imports", () => { assert.doesNotMatch(component, /credential-crypto|server-control-plane|supabase-control-repository|supabase-evidence-store|durable-evidence|commas-verifier|integration-experience-server/); for (const serverFile of ["lib/commerce/server-control-plane.ts", "lib/commerce/supabase-control-repository.ts", "lib/commerce/supabase-evidence-store.ts", "lib/commerce/durable-evidence.ts", "lib/commerce/commas-verifier.ts", "lib/commerce/integration-experience-server.ts"]) assert.match(read(serverFile), /^import "server-only";/); });
test("primary client navigation uses Connections and retains direct Settings routes", () => { const clientAdmin = MOCK_IDENTITIES.find((identity) => identity.id === "client-admin")!; const labels = navigationForIdentity(clientAdmin).map((item) => item.label); assert.ok(labels.includes("Connections")); assert.ok(!labels.includes("Settings")); assert.match(read("lib/app-navigation.ts"), /Workspace Settings/); assert.match(read("lib/navigation/production-routes.ts"), /settings: \(\) => "\/settings"/); });
test("Connection routes and links remain canonical without development identity state", () => { assert.doesNotMatch(component, /dev_identity/); for (const path of ["app/(app)/connections/page.tsx", "app/(app)/connections/commerce/page.tsx", "app/(app)/connections/sync-runs/page.tsx", "app/(app)/connections/readiness/page.tsx"]) assert.ok(read(path).length > 0); });
