import assert from "node:assert/strict";
import test from "node:test";
import { sealActiveAccount, readActiveAccount } from "../lib/identity/active-account-cookie";
import { sealActiveOrganization } from "../lib/identity/active-organization-cookie";
test("account selection is signed, identity-bound, expiring and distinct from organization selection", () => {
 const previous=process.env.WORKOS_COOKIE_PASSWORD;
 process.env.WORKOS_COOKIE_PASSWORD="test-only-password-longer-than-thirty-two-characters";
 try {
  const cookie=sealActiveAccount({userId:"user",accountId:"agency",expiresAt:200});
  assert.equal(readActiveAccount(cookie,"user",100),"agency");
  assert.equal(readActiveAccount(cookie,"foreign",100),null);
  assert.equal(readActiveAccount(cookie,"user",200),null);
  assert.equal(readActiveAccount(`${cookie}x`,"user",100),null);
  assert.equal(readActiveAccount(`${cookie}.extra`,"user",100),null);
  assert.equal(readActiveAccount(sealActiveOrganization({userId:"user",organizationId:"agency",expiresAt:200}),"user",100),null);
 } finally { if(previous===undefined) delete process.env.WORKOS_COOKIE_PASSWORD; else process.env.WORKOS_COOKIE_PASSWORD=previous; }
});
