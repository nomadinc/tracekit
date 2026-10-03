import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGoogleCustomerId,
  buildGoogleAccountDiscovery,
  type GoogleAccessibleCustomerFixture,
  type GoogleCustomerClientFixture,
} from "../lib/integrations/google-ads-account-discovery";

test("Google customer IDs normalize to digits without UI hyphens", () => {
  assert.equal(normalizeGoogleCustomerId("123-456-7890"), "1234567890");
  assert.equal(normalizeGoogleCustomerId(" 1234567890 "), "1234567890");
  assert.throws(() => normalizeGoogleCustomerId("abc"));
});

test("multiple directly accessible roots remain distinct manager access contexts", () => {
  const roots: GoogleAccessibleCustomerFixture[] = [
    { customerId: "1000000001" },
    { customerId: "2000000002" },
  ];
  const edges: GoogleCustomerClientFixture[] = [
    { loginCustomerId: "1000000001", customerId: "1000000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Agency One", currencyCode: "USD", timeZone: "America/Los_Angeles" },
    { loginCustomerId: "1000000001", customerId: "1100000001", parentCustomerId: "1000000001", level: 1, manager: false, descriptiveName: "Brand A", currencyCode: "USD", timeZone: "America/Los_Angeles" },
    { loginCustomerId: "2000000002", customerId: "2000000002", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Agency Two", currencyCode: "USD", timeZone: "America/New_York" },
    { loginCustomerId: "2000000002", customerId: "2100000002", parentCustomerId: "2000000002", level: 1, manager: false, descriptiveName: "Brand B", currencyCode: "USD", timeZone: "America/New_York" },
  ];
  const result = buildGoogleAccountDiscovery(roots, edges);
  assert.equal(result.roots.length, 2);
  assert.deepEqual(result.roots.map((row) => row.loginCustomerId), ["1000000001", "2000000002"]);
});

test("nested manager hierarchy preserves canonical parentage and spend eligibility", () => {
  const roots = [{ customerId: "1000000001" }];
  const edges: GoogleCustomerClientFixture[] = [
    { loginCustomerId: "1000000001", customerId: "1000000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Root MCC", currencyCode: "USD", timeZone: "UTC" },
    { loginCustomerId: "1000000001", customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Sub MCC", currencyCode: "USD", timeZone: "UTC" },
    { loginCustomerId: "1000000001", customerId: "1210000001", parentCustomerId: "1200000001", level: 2, manager: false, descriptiveName: "Client", currencyCode: "USD", timeZone: "UTC" },
  ];
  const result = buildGoogleAccountDiscovery(roots, edges);
  const sub = result.accounts.find((row) => row.customerId === "1200000001")!;
  const client = result.accounts.find((row) => row.customerId === "1210000001")!;
  assert.equal(sub.accountType, "manager");
  assert.equal(sub.eligibleForSpendSync, false);
  assert.equal(client.accountType, "advertiser");
  assert.equal(client.eligibleForSpendSync, true);
  assert.equal(client.parentCustomerId, "1200000001");
  assert.equal(client.hierarchyDepth, 2);
});

test("overlapping access paths preserve login context evidence without duplicating canonical account identity", () => {
  const roots = [{ customerId: "1000000001" }, { customerId: "1200000001" }];
  const edges: GoogleCustomerClientFixture[] = [
    { loginCustomerId: "1000000001", customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "Sub MCC", currencyCode: "USD", timeZone: "UTC" },
    { loginCustomerId: "1000000001", customerId: "1210000001", parentCustomerId: "1200000001", level: 2, manager: false, descriptiveName: "Shared Client", currencyCode: "USD", timeZone: "UTC" },
    { loginCustomerId: "1200000001", customerId: "1200000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "Sub MCC", currencyCode: "USD", timeZone: "UTC" },
    { loginCustomerId: "1200000001", customerId: "1210000001", parentCustomerId: "1200000001", level: 1, manager: false, descriptiveName: "Shared Client", currencyCode: "USD", timeZone: "UTC" },
  ];
  const result = buildGoogleAccountDiscovery(roots, edges);
  assert.equal(result.accounts.filter((row) => row.customerId === "1210000001").length, 1);
  const client = result.accounts.find((row) => row.customerId === "1210000001")!;
  assert.deepEqual(client.loginCustomerIds, ["1000000001", "1200000001"]);
});
