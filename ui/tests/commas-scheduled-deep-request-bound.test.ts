import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SCHEDULED_DEEP_PROVIDER_REQUEST_HARD_MAX,
  scheduledDeepAttemptAllowance,
  scheduledDeepProviderRequestLimit,
} from "../lib/commerce/scheduled-deep-contract";

test("scheduled deep provider request limits are explicit and fail closed",()=>{
  assert.equal(SCHEDULED_DEEP_PROVIDER_REQUEST_HARD_MAX,800);
  assert.equal(scheduledDeepProviderRequestLimit(800),800);
  for(const invalid of [undefined,null,0,-1,1.5,801,Number.MAX_SAFE_INTEGER,"800"])
    assert.throws(()=>scheduledDeepProviderRequestLimit(invalid),/invalid_scheduled_deep_provider_request_limit/);
});

test("retry allowance caps actual provider HTTP attempts at the reserved budget",()=>{
  assert.equal(scheduledDeepAttemptAllowance(800,0),3);
  assert.equal(scheduledDeepAttemptAllowance(800,798),2);
  assert.equal(scheduledDeepAttemptAllowance(800,799),1);
  assert.equal(scheduledDeepAttemptAllowance(800,800),0);
});

test("scheduled deep bound survives scheduler, queue, runtime, and worker",()=>{
  const scheduler=readFileSync(new URL("../../api/src/index.ts",import.meta.url),"utf8");
  const queue=readFileSync(new URL("../../api/src/continuous-commerce-cloudflare.ts",import.meta.url),"utf8");
  const runtime=readFileSync(new URL("../../api/continuous-runtime/src/index.ts",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
  assert.match(scheduler,/scheduledDeepProviderRequestLimit\(row\.deep_request_budget\)/);
  assert.match(scheduler,/currentLimit!==message\.max_provider_requests/);
  assert.match(queue,/max_provider_requests:scheduledDeepLimit!/);
  assert.match(runtime,/maxProviderRequests: message\.scheduled_deep===true \? message\.max_provider_requests : undefined/);
  assert.match(worker,/onAttempt\?\.\(\)/);
  assert.match(worker,/scheduledDeepAttemptAllowance\(scheduledDeepRequestLimit,providerRequests\)/);
  assert.match(worker,/reason:"bounded_deep_reconciliation_proof"/);
  assert.match(worker,/decision\.reason!=="provider_history_boundary"/);
});

test("ordinary and operator execution retain their existing bounds",()=>{
  const queue=readFileSync(new URL("../../api/src/continuous-commerce-cloudflare.ts",import.meta.url),"utf8");
  const runtime=readFileSync(new URL("../../api/continuous-runtime/src/index.ts",import.meta.url),"utf8");
  assert.match(queue,/v\.max_pages>8/);
  assert.match(runtime,/maxPages: bootstrap \? 1 : operatorOneShot \? message\.max_pages : undefined/);
});
