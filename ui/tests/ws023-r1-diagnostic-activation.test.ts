import assert from "node:assert/strict";
import test from "node:test";
import { customerReadDiagnosticsEnabled } from "../lib/identity/customer-read-diagnostic-policy";

test("diagnostics default disabled and false-like flags never enable", () => {
  for (const flag of [undefined, "", "false", "0", "true", "ENABLED"]) {
    assert.equal(customerReadDiagnosticsEnabled({ VERCEL_ENV: "preview", TRACEKIT_CUSTOMER_READ_DIAGNOSTICS: flag }), false);
  }
});
test("only Preview plus exact approved flag enables diagnostics", () => {
  assert.equal(customerReadDiagnosticsEnabled({ VERCEL_ENV: "preview", TRACEKIT_CUSTOMER_READ_DIAGNOSTICS: "enabled" }), true);
  for (const env of ["production", "development", "test", "", undefined]) {
    assert.equal(customerReadDiagnosticsEnabled({ VERCEL_ENV: env, TRACEKIT_CUSTOMER_READ_DIAGNOSTICS: "enabled" }), false);
  }
});
