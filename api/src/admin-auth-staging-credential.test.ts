import assert from"node:assert/strict";import test from"node:test";import{adminAuthError}from"./admin-auth";
function req(secret?:string){return new Request("https://api.trace-kit.io/v1/customers",{headers:secret?{"x-tk-secret":secret}:{}});}
test("existing production TK_SECRET_KEY remains accepted",()=>{assert.equal(adminAuthError(req("production-existing"),{TK_SECRET_KEY:"production-existing",TK_SECRET_KEY_STAGING:"staging-new"}),null);});
test("additive staging TK_SECRET_KEY_STAGING is accepted independently",()=>{assert.equal(adminAuthError(req("staging-new"),{TK_SECRET_KEY:"production-existing",TK_SECRET_KEY_STAGING:"staging-new"}),null);});
test("invalid credential still fails closed",async()=>{const r=adminAuthError(req("wrong"),{TK_SECRET_KEY:"production-existing",TK_SECRET_KEY_STAGING:"staging-new"});assert.ok(r);assert.equal(r.status,401);assert.equal((await r.json()).error,"unauthorized");});
test("missing configured credentials still fail closed",async()=>{const r=adminAuthError(req("anything"),{});assert.ok(r);assert.equal(r.status,500);assert.equal((await r.json()).error,"admin_auth_not_configured");});
test("staging-only configured credential remains valid without production key",()=>{assert.equal(adminAuthError(req("staging-new"),{TK_SECRET_KEY_STAGING:"staging-new"}),null);});
