import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const route=readFileSync(new URL("../app/api/actions/commas/webhook-test-delivery/route.ts",import.meta.url),"utf8");
test("M11 live route requires actions.execute and explicit confirmation",()=>{assert.match(route,/requirePermission\(resolution\.session,"actions\.execute"\)/);assert.match(route,/body\.confirm!==true/);});
test("M11 route resolves exact existing TraceKit subscription server-side",()=>{assert.match(route,/s\.webhookUrl===TARGET_URL/);assert.match(route,/s\.eventTypes\.includes\(EVENT\)/);assert.match(route,/matches\.length!==1/);assert.match(route,/const EVENT="dispute\.created"/);});
test("M11 route never returns or accepts Commas credential",()=>{assert.doesNotMatch(route,/apiKey:body|body\.apiKey/);assert.doesNotMatch(route,/apiKey,providerResponse/);});
test("M11 route is bounded to test delivery and no provider config mutation",()=>{assert.match(route,/providerConfigurationMutation:false/);assert.doesNotMatch(route,/createSubscription|updateSubscription|deleteSubscription/);});
test("M11 route verifies same origin",()=>{assert.match(route,/sameOrigin\(request\)/);});
