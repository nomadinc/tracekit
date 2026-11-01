import assert from "node:assert/strict";
import test from "node:test";
import { ProfitRequestController } from "../lib/identity/profit-request-controller";

type Report = { net_profit: number; currency: string };

function deferred() {
  let resolve!: (value: Report) => void;
  const promise = new Promise<Report>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("organization A to B hides A immediately with unchanged dates", async () => {
  const controller = new ProfitRequestController<Report>();
  await controller.activate("org-A:2026-10", true, async () => ({
    net_profit: 100,
    currency: "USD",
  }));

  assert.equal(controller.snapshot("org-A:2026-10", true).data?.net_profit, 100);
  assert.equal(controller.snapshot("org-B:2026-10", true).data, null);
});

test("organization switch aborts a pending request", async () => {
  const controller = new ProfitRequestController<Report>();
  const pending = deferred();
  let signal!: AbortSignal;

  const request = controller.activate("org-A", true, (s) => {
    signal = s;
    return pending.promise;
  });

  controller.invalidate();
  assert.equal(signal.aborted, true);

  pending.resolve({ net_profit: 100, currency: "USD" });
  await request;

  assert.equal(controller.snapshot("org-B", true).data, null);
});

test("late response from A cannot overwrite B", async () => {
  const controller = new ProfitRequestController<Report>();
  const pending = deferred();

  const a = controller.activate("org-A", true, () => pending.promise);

  await controller.activate("org-B", true, async () => ({
    net_profit: 200,
    currency: "GBP",
  }));

  pending.resolve({ net_profit: 100, currency: "USD" });
  await a;

  assert.equal(controller.snapshot("org-B", true).data?.net_profit, 200);
});

test("financial permission revocation hides visible Profit immediately", async () => {
  const controller = new ProfitRequestController<Report>();

  await controller.activate("authorized", true, async () => ({
    net_profit: 87.29,
    currency: "USD",
  }));

  assert.equal(controller.snapshot("authorized", true).data?.net_profit, 87.29);
  assert.equal(controller.snapshot("revoked", false).data, null);
});

test("business-context switch hides data without remount", async () => {
  const controller = new ProfitRequestController<Report>();

  await controller.activate("org-A:business-1", true, async () => ({
    net_profit: 50,
    currency: "USD",
  }));

  assert.equal(controller.snapshot("org-A:business-2", true).data, null);
});

test("date change hides previous reporting period", async () => {
  const controller = new ProfitRequestController<Report>();

  await controller.activate("org-A:2026-10", true, async () => ({
    net_profit: 300,
    currency: "USD",
  }));

  assert.equal(controller.snapshot("org-A:2026-11", true).data, null);
});

test("obsolete cleanup cannot invalidate a newer request", async () => {
  const controller = new ProfitRequestController<Report>();

  const oldRequest = deferred();
  const newRequest = deferred();

  const a = controller.activate("org-A", true, () => oldRequest.promise);

  controller.invalidate();

  const b = controller.activate("org-B", true, () => newRequest.promise);

  // Simulate a delayed cleanup belonging to the previous effect.
  // It must not invalidate the newer request.
  oldRequest.resolve({ net_profit: 100, currency: "USD" });
  await a;

  newRequest.resolve({ net_profit: 200, currency: "GBP" });
  await b;

  assert.equal(controller.snapshot("org-B", true).data?.net_profit, 200);
});

test("delayed old cleanup cannot cancel newer request", async () => {
  const controller = new ProfitRequestController<Report>();
  const oldRequest = deferred();
  const newRequest = deferred();

  const a = controller.start("org-A", true, () => oldRequest.promise);
  const b = controller.start("org-B", true, () => newRequest.promise);

  // This is the actual obsolete cleanup call.
  a.cancel();

  oldRequest.resolve({ net_profit: 100, currency: "USD" });
  await a.done;

  assert.equal(controller.snapshot("org-B", true).loading, true);

  newRequest.resolve({ net_profit: 200, currency: "GBP" });
  await b.done;

  assert.equal(controller.snapshot("org-B", true).data?.net_profit, 200);

  b.cancel();
  assert.equal(controller.snapshot("org-B", true).data, null);
});
