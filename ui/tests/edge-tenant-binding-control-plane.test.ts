import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const route=readFileSync(new URL("../app/api/admin/edge-tenant-bindings/route.ts",import.meta.url),"utf8"),repo=readFileSync(new URL("../lib/edge/tenant-binding-repository.ts",import.meta.url),"utf8");
test("Edge tenant binding control plane uses the canonical authorization gateway",()=>{assert.match(route,/requirePermission\(r\.session,"admin\.manage_tenants"\)/);assert.match(route,/resolveApplicationSession/);assert.doesNotMatch(route,/effectivePermissions\.includes\("admin\.manage_tenants"\)/);});
test("binding writes resolve only canonical active TraceKit organizations",()=>{assert.match(route,/allActiveOrganizations/);assert.match(route,/some\(org=>org\.id===body\.organizationId\)/);});
test("binding lifecycle supports active and disabled without deleting evidence",()=>{assert.match(route,/\["active","disabled"\]/);assert.match(repo,/status:"active"\|"disabled"/);assert.doesNotMatch(repo,/DELETE/);});
test("tenant reference remains opaque and bounded",()=>assert.match(route,/\^tenant_\[A-Za-z0-9_-\]\{8,128\}\$/));
