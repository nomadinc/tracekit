import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverGoogleCustomerHierarchy,
  type GoogleHierarchyFetcher,
} from "../lib/integrations/google-ads-hierarchy-client";

test("hierarchy traversal recursively queries managers with explicit login customer context", async () => {
  const calls: Array<{ target: string; login: string }> = [];
  const fetchHierarchy: GoogleHierarchyFetcher = async ({ targetCustomerId, loginCustomerId }) => {
    calls.push({ target: targetCustomerId, login: loginCustomerId });
    if (targetCustomerId === "1000000001") return [
      { customerId: "1000000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Root", currencyCode: "USD", timeZone: "UTC" },
      { customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC" },
      { customerId: "1100000001", parentCustomerId: "1000000001", level: 1, manager: false, descriptiveName: "Client A", currencyCode: "USD", timeZone: "UTC" },
    ];
    if (targetCustomerId === "1200000001") return [
      { customerId: "1200000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC" },
      { customerId: "1210000001", parentCustomerId: "1200000001", level: 1, manager: false, descriptiveName: "Client B", currencyCode: "USD", timeZone: "UTC" },
    ];
    return [];
  };

  const result = await discoverGoogleCustomerHierarchy({
    accessibleCustomerIds: ["1000000001"],
    fetchHierarchy,
  });
  assert.deepEqual(calls, [
    { target: "1000000001", login: "1000000001" },
    { target: "1200000001", login: "1000000001" },
  ]);
  const client = result.accounts.find((row) => row.customerId === "1210000001")!;
  assert.equal(client.parentCustomerId, "1200000001");
  assert.equal(client.hierarchyDepth, 2);
  assert.deepEqual(client.loginCustomerIds, ["1000000001"]);
});

test("multiple accessible roots preserve overlapping login contexts without duplicate canonical accounts", async () => {
  const fetchHierarchy: GoogleHierarchyFetcher = async ({ targetCustomerId, loginCustomerId }) => {
    if (targetCustomerId === "1000000001") return [
      { customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Shared MCC", currencyCode: "USD", timeZone: "UTC" },
    ];
    if (targetCustomerId === "1200000001") return [
      { customerId: "1210000001", parentCustomerId: "1200000001", level: 1, manager: false, descriptiveName: "Shared Client", currencyCode: "USD", timeZone: "UTC" },
    ];
    throw new Error(`unexpected ${targetCustomerId} via ${loginCustomerId}`);
  };
  const result = await discoverGoogleCustomerHierarchy({
    accessibleCustomerIds: ["1000000001", "1200000001"],
    fetchHierarchy,
  });
  const client = result.accounts.find((row) => row.customerId === "1210000001")!;
  assert.deepEqual(client.loginCustomerIds, ["1000000001", "1200000001"]);
  assert.equal(result.accounts.filter((row) => row.customerId === "1210000001").length, 1);
});

test("cycle and duplicate observations do not recurse forever", async () => {
  let calls = 0;
  const fetchHierarchy: GoogleHierarchyFetcher = async ({ targetCustomerId }) => {
    calls += 1;
    if (targetCustomerId === "1000000001") return [
      { customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC" },
      { customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC" },
    ];
    return [
      { customerId: "1000000001", parentCustomerId: "1200000001", level: 1, manager: true, descriptiveName: "Root", currencyCode: "USD", timeZone: "UTC" },
    ];
  };
  await discoverGoogleCustomerHierarchy({ accessibleCustomerIds: ["1000000001"], fetchHierarchy });
  assert.equal(calls, 2);
});

test("configured discovery bounds fail explicitly instead of returning partial hierarchy", async () => {
  const fetchHierarchy: GoogleHierarchyFetcher = async ({ targetCustomerId }) => [
    { customerId: targetCustomerId, parentCustomerId: null, level: 0, manager: true, descriptiveName: "Manager", currencyCode: "USD", timeZone: "UTC" },
    { customerId: "1200000001", parentCustomerId: targetCustomerId, level: 1, manager: true, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC" },
  ];
  await assert.rejects(
    () => discoverGoogleCustomerHierarchy({ accessibleCustomerIds: ["1000000001"], fetchHierarchy, maxQueries: 1 }),
    /discovery bound exceeded/i,
  );
});
