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
const originRoute = read("app/api/tkid/origins/[...originPath]/route.ts");

test("Connections overview preserves the approved commerce provider roadmap", () => {
  assert.deepEqual(
    PROVIDER_CATALOG.map((provider) => provider.name),
    ["Commas", "Everflow", "Shopify", "29Next", "Checkout Champ", "WooCommerce", "Sticky.io"],
  );
  assert.deepEqual(
    PROVIDER_CATALOG.filter((provider) => provider.availability === "available").map((provider) => provider.provider),
    ["commas", "everflow", "shopify", "next29"],
  );
});
test("Commas capability presentation preserves verified limitations", () => { assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Products")?.state, "limited"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Refunds")?.state, "embedded"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Chargebacks / Disputes")?.state, "webhook_only"); assert.equal(COMMAS_CAPABILITIES.find((item) => item.name === "Attribution identifiers")?.state, "unavailable"); });
test("Connection experience never renders credential or evidence secrets", () => { for (const forbidden of ["secret_ciphertext", "secret_iv", "storage_reference", "COMMAS_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) assert.equal(component.includes(forbidden), false); assert.match(component, /type="password"/); });
test("credential flow never echoes the submitted API key", () => { assert.doesNotMatch(component, /setNotice\([^)]*apiKey/); assert.match(component, /target\.reset\(\)/); });
test("commerce mutation route always uses structured JSON envelopes", () => { assert.match(route, /NextResponse\.json/); assert.match(route, /code: "internal_error"|"internal_error"/); assert.match(route, /x-tracekit-request-id/); assert.doesNotMatch(route, /new Response\(null/); });
test("commerce mutations enforce same-origin requests and persistent sessions", () => { assert.match(route, /sameOrigin\(request\)/); assert.match(route, /resolution\.kind !== "authenticated"/); assert.doesNotMatch(route, /dev_identity/); });
test("continuous Shadow execution remains background-only and never becomes browser activation", () => { assert.match(component, /Continuous Shadow ingestion/); assert.match(component, /durable scheduler\/worker boundary/); assert.doesNotMatch(component, /runContinuousCommasSync|COMMERCE_CREDENTIALS_ENC_KEY/); assert.doesNotMatch(route, /enqueue_commerce_continuous_sync|claimSyncRun|live_beta/); });
test("readiness is loaded server-side and cannot be posted by the browser", () => { assert.doesNotMatch(route, /readinessEvidence|live_beta/); assert.match(read("lib/commerce/integration-experience-server.ts"), /readiness_evidence/); });
test("production readiness is read-only, server-derived, and keeps activation unavailable in browser routes",()=>{const server=read("lib/commerce/integration-experience-server.ts");assert.match(server,/tracekit_production_controls/);assert.match(server,/commerce_connection_pauses/);assert.match(component,/Production controls/);assert.doesNotMatch(route,/scheduler_enabled|source_enabled_shadow|tracekit_production_controls/)});
test("client bundle has no service-role, crypto, verifier, persistence, or Evidence imports", () => { assert.doesNotMatch(component, /credential-crypto|server-control-plane|supabase-control-repository|supabase-evidence-store|durable-evidence|commas-verifier|integration-experience-server/); for (const serverFile of ["lib/commerce/server-control-plane.ts", "lib/commerce/supabase-control-repository.ts", "lib/commerce/supabase-evidence-store.ts", "lib/commerce/durable-evidence.ts", "lib/commerce/commas-verifier.ts", "lib/commerce/integration-experience-server.ts"]) assert.match(read(serverFile), /^import "server-only";/); });
test("primary client navigation uses Connections and retains direct Settings routes", () => { const clientAdmin = MOCK_IDENTITIES.find((identity) => identity.id === "client-admin")!; const labels = navigationForIdentity(clientAdmin).map((item) => item.label); assert.ok(labels.includes("Connections")); assert.ok(!labels.includes("Settings")); assert.match(read("lib/app-navigation.ts"), /Workspace Settings/); assert.match(read("lib/navigation/production-routes.ts"), /settings: \(\) => "\/settings"/); });
test("Connection routes and links remain canonical without development identity state", () => { assert.doesNotMatch(component, /dev_identity/); for (const path of ["app/(app)/connections/page.tsx", "app/(app)/connections/commerce/page.tsx", "app/(app)/connections/sync-runs/page.tsx", "app/(app)/connections/readiness/page.tsx"]) assert.ok(read(path).length > 0); });
test("managed TKID origin lifecycle is understandable and remains source-gated",()=>{assert.match(component,/TKID Approved Origins/);assert.match(component,/Verification and activation are separate/);assert.match(component,/Historical Journeys and their observed origin remain preserved/);for(const action of ["Add Origin","Verify","Activate","Retire","Reactivate","Reissue Verification"])assert.match(component,new RegExp(action));assert.match(component,/collection remains \{registry\.sourceState\}/)});
test("origin mutations are persistent-session, Product/Admin-scoped, same-origin, tenant-derived operations",()=>{assert.match(originRoute,/resolveApplicationSession/);assert.match(originRoute,/requireTkidOriginManagement\(resolution\.session\)/);assert.match(originRoute,/sameOrigin\(request\)/);assert.match(originRoute,/activeOrganization\.id/);assert.doesNotMatch(originRoute,/body\.organizationId|body\.organization_id|dev_identity/)});
test("ordinary Organization Admin cannot receive or render the managed origin registry",()=>{const server=read("lib/commerce/integration-experience-server.ts"),authorization=read("lib/tkid/origin-authorization.ts");assert.match(server,/canManageOrigins\?optionalRows\(`tkid_sources/);assert.match(component,/if\(!registry\.canManage\)return null/);assert.match(authorization,/override\.resourceType === TKID_ORIGIN_RESOURCE_TYPE/);assert.match(authorization,/override\.organizationId === organizationId/)});
test("origin verification secrets remain one-time and audit metadata is safe",()=>{assert.match(originRoute,/randomBytes\(24\)/);assert.match(originRoute,/token_digest:digest/);assert.match(originRoute,/shown only now/);assert.doesNotMatch(component,/token_digest|SUPABASE_SERVICE_ROLE_KEY|handoff.*secret/i)});
