import test from "node:test";
import assert from "node:assert/strict";
import {
  openOwnedDrawer,
  closeOwnedDrawer,
  visibleOwnedDrawer,
} from "../lib/identity/drawer-ownership";

test("drawer is visible only in its original context", () => {
  const drawer = openOwnedDrawer("org-A", "owner-A", "Customer A");

  assert.equal(visibleOwnedDrawer(drawer, "org-A")?.value, "Customer A");
  assert.equal(visibleOwnedDrawer(drawer, "org-B"), null);
});

test("obsolete owner cannot close newer drawer", () => {
  const newer = openOwnedDrawer("org-B", "owner-B", "Customer B");

  assert.equal(closeOwnedDrawer(newer, "owner-A"), newer);
});

test("same-context replacement retains newer owner", () => {
  const newer = openOwnedDrawer("org-A", "owner-new", "New drawer");

  assert.equal(closeOwnedDrawer(newer, "owner-old"), newer);
});

test("current owner can close its drawer", () => {
  const drawer = openOwnedDrawer("org-A", "owner-A", "Customer A");

  assert.equal(closeOwnedDrawer(drawer, "owner-A"), null);
});

test("unowned legacy drawer remains compatible", () => {
  const drawer = openOwnedDrawer("org-A", null, "Legacy drawer");

  assert.equal(closeOwnedDrawer(drawer), null);
});

test("missing drawer remains closed", () => {
  assert.equal(closeOwnedDrawer(null, "owner-A"), null);
  assert.equal(visibleOwnedDrawer(null, "org-A"), null);
});

import { admitOwnedDrawer, admitLeasedDrawer } from "../lib/identity/drawer-ownership";

test("late organization A open cannot replace organization B drawer", () => {
  const newer = openOwnedDrawer("org-B", "owner-B", "Customer B");

  const result = admitOwnedDrawer(
    newer,
    "org-B",
    "org-A",
    "owner-A",
    "Customer A"
  );

  assert.equal(result, newer);
});

test("revoked old owner cannot replace newer same-context drawer", () => {
  const newer = openOwnedDrawer("org-A", "owner-new", "New drawer");
  const oldLease = createDrawerOwnerLease("owner-old");

  revokeDrawerOwnerLease(oldLease);

  const result = admitLeasedDrawer(
    newer,
    "org-A",
    "org-A",
    oldLease,
    "Old drawer"
  );

  assert.equal(result, newer);
});

test("current-context request can open a drawer", () => {
  const result = admitOwnedDrawer(
    null,
    "org-A",
    "org-A",
    "owner-A",
    "Customer A"
  );

  assert.equal(result?.value, "Customer A");
});

import {
  createDrawerOwnerLease,
  revokeDrawerOwnerLease,
  canOpenOwnedDrawer,
} from "../lib/identity/drawer-ownership";

test("active owner lease permits drawer operations", () => {
  const lease = createDrawerOwnerLease("owner-A");
  assert.equal(canOpenOwnedDrawer(lease), true);
});

test("revoked owner lease rejects late drawer operations", () => {
  const lease = createDrawerOwnerLease("owner-A");
  revokeDrawerOwnerLease(lease);
  assert.equal(canOpenOwnedDrawer(lease), false);
});

test("revoking old owner does not revoke new owner", () => {
  const oldLease = createDrawerOwnerLease("owner-old");
  const newLease = createDrawerOwnerLease("owner-new");

  revokeDrawerOwnerLease(oldLease);

  assert.equal(canOpenOwnedDrawer(oldLease), false);
  assert.equal(canOpenOwnedDrawer(newLease), true);
});

import { readFileSync } from "node:fs";

const providerSource = readFileSync(
  new URL("../components/layout/shell-drawer.tsx", import.meta.url),
  "utf8"
);

const customerSource = readFileSync(
  new URL("../components/customers/customer-workspace.tsx", import.meta.url),
  "utf8"
);

test("shared provider enforces owner leases", () => {
  assert.match(providerSource, /admitLeasedDrawer/);
  assert.match(providerSource, /options\.lease/);
  assert.match(providerSource, /activeContextRef\.current/);
});

test("drawer rendering is fenced to current security context", () => {
  assert.match(providerSource, /visibleOwnedDrawer\(storedDrawer, contextKey\)/);
  assert.match(providerSource, /permissions: Array\.from\(effectivePermissions/);
  assert.match(providerSource, /authenticated: session\.authenticated/);
});

test("Customer Workspace passes captured leases to both drawer entrypoints", () => {
  assert.equal(
    (customerSource.match(/lease: requestLease/g) || []).length,
    2
  );

  assert.equal(
    (customerSource.match(/ownerLeaseRef\.current === requestLease/g) || []).length,
    2
  );

  assert.equal(
    (customerSource.match(/lease: ownerLeaseRef\.current/g) || []).length,
    0
  );
});

test("Customer Workspace revokes lease before closing drawer", () => {
  assert.match(
    customerSource,
    /revokeDrawerOwnerLease\(lease\);[\s\S]*?drawer\.closeDrawer\(drawerOwner\)/
  );
});

test("drawer context includes allowed organization membership", () => {
  assert.match(
    providerSource,
    /allowedOrganizations:\s*\[[\s\S]*?session\.identity\.membership\.organizationIds[\s\S]*?\]\.sort\(\)/
  );
});

test("revoked organization context immediately hides prior drawer", () => {
  const before = JSON.stringify({
    identityId: "user-1",
    membershipId: "membership-1",
    organizationId: "org-A",
    permissions: ["customers.view"],
    allowedOrganizations: ["org-A", "org-B"],
  });

  const after = JSON.stringify({
    identityId: "user-1",
    membershipId: "membership-1",
    organizationId: "org-A",
    permissions: ["customers.view"],
    allowedOrganizations: ["org-B"],
  });

  const drawer = openOwnedDrawer(before, "owner-A", "Customer A");

  assert.equal(visibleOwnedDrawer(drawer, before)?.value, "Customer A");
  assert.equal(visibleOwnedDrawer(drawer, after), null);
});
