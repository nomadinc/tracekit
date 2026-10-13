import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const route=readFileSync(new URL("../app/api/actions/provider-discovery/route.ts",import.meta.url),"utf8"),card=readFileSync(new URL("../components/connections/governed-provider-actions.tsx",import.meta.url),"utf8"),connections=readFileSync(new URL("../components/connections/connections-overview.tsx",import.meta.url),"utf8"),ops=readFileSync(new URL("../app/(app)/operations/operations-client.tsx",import.meta.url),"utf8"),nav=readFileSync(new URL("../lib/identity/navigation-policy.ts",import.meta.url),"utf8");
test("M16 governed actions API remains authenticated TraceKit-session scoped",()=>{assert.match(route,/resolveApplicationSession/);assert.match(route,/discoverProviderActions/);assert.doesNotMatch(route,/TK_SECRET_KEY|TRACEKIT_TK_SECRET|x-tk-secret/);});
test("M16 governed actions render on live Connections and not legacy Operations",()=>{assert.match(connections,/GovernedProviderActions/);assert.doesNotMatch(ops,/GovernedProviderActions/);assert.match(nav,/label: "Connections", href: "\/connections"/);assert.doesNotMatch(nav,/label: "Operations"/);});
test("M16 Connections supports preparation and deliberate confirmation without execution",()=>{
 for(const endpoint of ["provider-discovery","provider-prepare","provider-confirm"])assert.ok(card.includes("/api/actions/"+endpoint));
 assert.match(card,/Prepared — not confirmed/);assert.match(card,/Confirmed — not executed/);
 assert.match(card,/fresh human confirmation remains required before any execution/);
 assert.match(card,/onClick=\{\(\)=>prepare\(a\.operation\)\}/);
 assert.match(card,/onClick=\{\(\)=>confirm\(a\.operation,p\.intentId\)\}/);
 assert.match(card,/Confirm this prepared action/);
 assert.deepEqual([...card.matchAll(/fetch\("([^"]+)"/g)].map(m=>m[1]),["/api/actions/provider-discovery","/api/actions/provider-prepare","/api/actions/provider-confirm"]);
 assert.doesNotMatch(card,/provider-execute|executeShopify|executeCommas|execute_|consumptionId|consumption_id|idempotencyKey|idempotency_key/);
});
