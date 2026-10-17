import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateEdgeIntelligenceV1 } from "../lib/edge/intelligence-v1-validator";

const document: unknown = JSON.parse(readFileSync(
  new URL("./fixtures/edge-intelligence-v1.examples.json", import.meta.url), "utf8"
));
assert.ok(document && typeof document === "object" && !Array.isArray(document));
const fixtureDocument = document as Record<string, unknown>;
assert.equal(fixtureDocument.schemaVersion, "1.0");
assert.equal(fixtureDocument.sanitized, true);
assert.ok(fixtureDocument.scenarios && typeof fixtureDocument.scenarios === "object" && !Array.isArray(fixtureDocument.scenarios));
const scenarios = Object.entries(fixtureDocument.scenarios as Record<string, unknown>);
assert.ok(scenarios.length > 0, "At least one pinned canonical scenario is required");
for (const [name, value] of scenarios) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `Scenario ${name} must be an object`);
}
const base = () => structuredClone(scenarios[0][1]) as Record<string, any>;

test("Core validator accepts every pinned canonical Edge v1 fixture", () => {
  for (const [name, value] of scenarios) {
    const result = validateEdgeIntelligenceV1(value);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
  }
});

test("Core validator rejects breaking version, tenant mismatch and routing fields", () => {
  const value = base();
  assert.equal(validateEdgeIntelligenceV1({...value, schemaVersion: "2.0"}).ok, false);
  assert.equal(validateEdgeIntelligenceV1(value, {tenantRef: "tenant_not_the_fixture"}).ok, false);
  assert.equal(validateEdgeIntelligenceV1({...value, intelligence: {...value.intelligence, routingDecision: "money"}}).ok, false);
});

test("Core validator preserves unknown provider identifiers", () => {
  const value = base();
  assert.ok(Array.isArray(value.evidence) && value.evidence.length > 0, "Provider test needs real evidence");
  value.evidence[0].provider = "future_provider_x";
  assert.equal(validateEdgeIntelligenceV1(value).ok, true);
});

for (const [name, address, code] of [
  ["IPv4", "198.51.100.7", "RAW_IPV4"],
  ["IPv6", "2001:db8:abcd:12:0:0:0:1", "RAW_IPV6"],
] as const) {
  test(`Core validator rejects raw ${name} in nested optional v1 fields`, () => {
    const value = base();
    value.futureOptional = {extra: [{details: {note: address}}]};
    const result = validateEdgeIntelligenceV1(value);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some(e => e.code === code), JSON.stringify(result.errors));
  });
}

test("Core validator rejects nested forbidden fields", () => {
  const value = base();
  value.futureOptional = {extra: [{diagnostics: {rawIp: "redacted", routingDecision: "money"}}]};
  const result = validateEdgeIntelligenceV1(value);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some(e => e.code === "FORBIDDEN_FIELD" && e.path.endsWith(".rawIp")));
    assert.ok(result.errors.some(e => e.code === "FORBIDDEN_FIELD" && e.path.endsWith(".routingDecision")));
  }
});
