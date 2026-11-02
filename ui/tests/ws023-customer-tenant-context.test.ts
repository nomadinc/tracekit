import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customerWorkspaceContext } from "../lib/identity/customer-workspace-context";
import type { IdentitySession } from "../lib/identity/types";

const source = readFileSync(
  new URL("../components/customers/customer-workspace.tsx", import.meta.url),
  "utf8"
);

function session(): IdentitySession {
  return {
    authenticated: true,
    developmentOnly: false,
    activeOrganizationId: "org-A",
    activeBusinessContextId: "business-1",
    identity: {
      id: "user-1",
      name: "Test",
      email: "test@example.test",
      title: "Analyst",
      membership: {
        id: "membership-1",
        accountId: "account-1",
        accountName: "Test",
        accountType: "client",
        role: "organization-admin",
        organizationIds: ["org-A", "org-B"],
      },
    },
  };
}

test("Customer Workspace uses context-keyed component identity", () => {
  assert.match(source, /CustomerWorkspaceContent key=\{context\.key\}/);
  assert.match(source, /context\.authorized/);
});

test("organization switching changes customer component identity", () => {
  const a = session();
  const b = {
    ...a,
    activeOrganizationId: "org-B",
  };
  assert.notEqual(
    customerWorkspaceContext(a).key,
    customerWorkspaceContext(b).key
  );
});

test("business-context switching changes customer component identity", () => {
  const a = session();
  const b = {
    ...a,
    activeBusinessContextId: "business-2",
  };
  assert.notEqual(
    customerWorkspaceContext(a).key,
    customerWorkspaceContext(b).key
  );
});

test("permission loss denies customer workspace", () => {
  const a = session();
  const b = session();

  b.identity.membership.denials = ["customers.view"];

  assert.equal(customerWorkspaceContext(a).authorized, true);
  assert.equal(customerWorkspaceContext(b).authorized, false);
  assert.notEqual(
    customerWorkspaceContext(a).key,
    customerWorkspaceContext(b).key
  );
});

test("authentication loss denies customer workspace", () => {
  const a = session();
  a.authenticated = false;

  assert.equal(customerWorkspaceContext(a).authorized, false);
});

test("foreign organization is denied", () => {
  const a = session();
  a.activeOrganizationId = "foreign";

  assert.equal(customerWorkspaceContext(a).authorized, false);
});

test("financial permission changes invalidate customer context", () => {
  const a = session();
  const b = session();

  b.identity.membership.denials = ["orders.view_financials"];

  assert.notEqual(
    customerWorkspaceContext(a).key,
    customerWorkspaceContext(b).key
  );
});

test("Customer Workspace closes shared drawer on context unmount", () => {
  assert.match(source, /return \(\) => \{[\s\S]*?mountedRef\.current = false;[\s\S]*?drawer\.closeDrawer\(\)/);
});

test("manual drawer request rejects late responses after unmount", () => {
  assert.match(source, /if \(r && mountedRef\.current\)/);
});

test("deep-link drawer request has cleanup fencing", () => {
  assert.match(source, /if \(on && r\)[\s\S]*?drawer\.openDrawer/);
  assert.match(source, /return \(\) => \{[\s\S]*?on = false;/);
});
