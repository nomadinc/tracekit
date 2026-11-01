import assert from "node:assert/strict";
import test from "node:test";

import { profitReportContext } from "../lib/identity/profit-report-context";
import type { IdentitySession } from "../lib/identity/types";

function session(): IdentitySession {
  return {
    authenticated: true,
    developmentOnly: false,
    identity: {
      id: "user-1",
      name: "Test User",
      email: "test@example.test",
      title: "Finance",
      membership: {
        id: "membership-1",
        accountId: "account-1",
        accountName: "Test Account",
        accountType: "client",
        role: "finance",
        organizationIds: ["org-A", "org-B"],
      },
    },
    activeOrganizationId: "org-A",
    activeBusinessContextId: "business-1",
  };
}

test("finance role is authorized for detailed Profit", () => {
  assert.equal(profitReportContext(session()).authorized, true);
});

test("client-read-only cannot access detailed Profit", () => {
  const s = session();
  s.identity.membership.role = "client-read-only";
  assert.equal(profitReportContext(s).authorized, false);
});

test("organization switch changes Profit context key", () => {
  const a = session();
  const b = session();
  b.activeOrganizationId = "org-B";

  assert.notEqual(profitReportContext(a).key, profitReportContext(b).key);
});

test("business-context switch changes Profit context key", () => {
  const a = session();
  const b = session();
  b.activeBusinessContextId = "business-2";

  assert.notEqual(profitReportContext(a).key, profitReportContext(b).key);
});

test("permission revocation changes key and denies Profit", () => {
  const a = session();
  const b = session();
  b.identity.membership.denials = ["orders.view_financials"];

  assert.notEqual(profitReportContext(a).key, profitReportContext(b).key);
  assert.equal(profitReportContext(b).authorized, false);
});

test("foreign organization is denied", () => {
  const s = session();
  s.activeOrganizationId = "foreign-org";

  assert.equal(profitReportContext(s).authorized, false);
});

test("authentication loss denies Profit and changes context", () => {
  const a = session();
  const b = session();
  b.authenticated = false;

  assert.notEqual(profitReportContext(a).key, profitReportContext(b).key);
  assert.equal(profitReportContext(b).authorized, false);
});
