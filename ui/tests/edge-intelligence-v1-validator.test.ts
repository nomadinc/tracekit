import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateEdgeIntelligenceV1 } from "../lib/edge/intelligence-v1-validator";

export function canonicalScenarios(input: unknown): Record<string, Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("fixture_root_invalid");
  const root = input as Record<string, unknown>;
  if (root.schemaVersion !== "1.0" || root.sanitized !== true) throw new Error("fixture_metadata_invalid");
  if (Object.keys(root).some(key => !["schemaVersion", "sanitized", "scenarios"].includes(key)))
    throw new Error("fixture_root_unexpected_field");
  const scenarios = root.scenarios;
  if (!scenarios || typeof scenarios !== "object" || Array.isArray(scenarios))
    throw new Error("fixture_scenarios_invalid");
  const entries = Object.entries(scenarios);
  if (!entries.length) throw new Error("fixture_scenarios_empty");
  for (const [id, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id) || !value || typeof value !== "object" || Array.isArray(value))
      throw new Error("fixture_scenario_invalid");
    if ((value as Record<string, unknown>).schemaVersion !== "1.0") throw new Error("fixture_scenario_schema_invalid");
  }
  return scenarios as Record<string, Record<string, unknown>>;
}
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/edge-intelligence-v1.examples.json", import.meta.url), "utf8"));
const scenarios = canonicalScenarios(fixtures);
const ids = Object.keys(scenarios);
const first = () => structuredClone(scenarios[ids[0]]) as Record<string, any>;

test("fixture loader uses canonical scenarios and preserves IDs", () => {
  assert.ok(ids.length > 0);
  assert.ok(ids.includes("normalResidential"));
  assert.ok(!ids.includes("schemaVersion"));
  assert.ok(!ids.includes("sanitized"));
  assert.equal(Object.keys(scenarios).length, ids.length);
});
test("fixture loader rejects missing malformed and unexpected scenario structures", () => {
  for (const value of [null, [], {}, {schemaVersion:"1.0",sanitized:true},
    {schemaVersion:"1.0",sanitized:true,scenarios:[]},
    {schemaVersion:"1.0",sanitized:true,scenarios:{}},
    {schemaVersion:"1.0",sanitized:true,scenarios:{bad:null}},
    {schemaVersion:"1.0",sanitized:true,scenarios:{bad:{schemaVersion:"2.0"}}},
    {schemaVersion:"1.0",sanitized:true,scenarios:{normalResidential:first()},extra:"unexpected"}])
    assert.throws(() => canonicalScenarios(value));
});
test("Core validator accepts every pinned canonical Edge v1 fixture", () => {
  for (const [id, value] of Object.entries(scenarios)) {
    const result = validateEdgeIntelligenceV1(value);
    assert.equal(result.ok, true, id + ": " + JSON.stringify(result));
  }
});
test("Core validator rejects version tenant mismatch and routing fields", () => {
  const base = first();
  assert.equal(validateEdgeIntelligenceV1({...base,schemaVersion:"2.0"}).ok,false);
  assert.equal(validateEdgeIntelligenceV1(base,{tenantRef:"tenant_not_the_fixture"}).ok,false);
  assert.equal(validateEdgeIntelligenceV1({...base,intelligence:{...base.intelligence,routingDecision:"money"}}).ok,false);
});
test("Core validator preserves unknown provider identifiers", () => {
  const base = first();
  assert.ok(base.evidence.length > 0);
  base.evidence[0].provider = "future_provider_x";
  assert.equal(validateEdgeIntelligenceV1(base).ok,true);
});
test("Core validator rejects nested forbidden fields and raw IPv4/IPv6", () => {
  const base = first();
  for (const mutation of [
    {futureOptional:{note:"198.51.100.7"}},
    {futureOptional:{nested:[{note:"2001:db8:abcd:12::1"}]}},
    {futureOptional:{nested:[{rawIp:"synthetic"}]}},
    {futureOptional:{nested:[{paymentData:{token:"synthetic"}}]}}
  ]) {
    const result = validateEdgeIntelligenceV1({...base,...mutation});
    assert.equal(result.ok,false,JSON.stringify(mutation));
  }
});
