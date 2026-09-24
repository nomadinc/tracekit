import test from "node:test";
import assert from "node:assert/strict";
import { persistentBusinessContextsWithDisplay } from "../lib/identity/business-context-resolution";

test("persistent context absent from mock metadata remains authorized and active", () => {
  const context = { id: "push-button-system-5f1de64a", organizationId: "5f1de64a-1b37-40bb-81c8-32197eda0b41", name: "Push Button System", mark: "PB" };
  const resolved = persistentBusinessContextsWithDisplay([context], []);
  assert.deepEqual(resolved, [context]);
  assert.equal(resolved[0]?.id, "push-button-system-5f1de64a");
});

test("mock metadata may decorate but cannot change persistent identity or tenant scope", () => {
  const context = { id: "context-1", organizationId: "org-persistent", name: "Persistent Name", mark: "PN" };
  const resolved = persistentBusinessContextsWithDisplay([context], [{ id: "context-1", organizationId: "org-mock", name: "Display Name", mark: "DN" }]);
  assert.deepEqual(resolved, [{ ...context, name: "Display Name", mark: "DN" }]);
});
