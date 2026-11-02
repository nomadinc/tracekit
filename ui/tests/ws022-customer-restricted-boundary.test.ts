import assert from "node:assert/strict";
import test from "node:test";
import { productionCustomerRepository } from "../lib/customers/production-repository";

const scope = {
  authenticated: true,
  organizationId: "org-test",
  workspaceId: "org-test",
  businessContextId: null,
};

test("restricted server repository fails closed before legacy Core transport", async () => {
  const previousMode = process.env.TRACEKIT_REPORTING_MODE;
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousSecret = process.env.TK_SECRET_KEY;
  const previousFetch = globalThis.fetch;

  let fetchCalls = 0;

  try {
    process.env.VERCEL_ENV = "preview";
    process.env.TRACEKIT_REPORTING_MODE = "restricted-staging";
    process.env.TK_SECRET_KEY = "test-secret-not-for-network";

    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("Network transport must not be reached");
    }) as typeof fetch;

    await assert.rejects(
      productionCustomerRepository.listCustomers(scope as any),
      /customer_repository_core_http_503/
    );

    assert.equal(fetchCalls, 0);
  } finally {
    if (previousMode === undefined) delete process.env.TRACEKIT_REPORTING_MODE;
    else process.env.TRACEKIT_REPORTING_MODE = previousMode;

    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;

    if (previousSecret === undefined) delete process.env.TK_SECRET_KEY;
    else process.env.TK_SECRET_KEY = previousSecret;

    globalThis.fetch = previousFetch;
  }
});
