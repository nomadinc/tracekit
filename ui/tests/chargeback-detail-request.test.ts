import assert from "node:assert/strict";
import test from "node:test";
import { createDetailRequestCoordinator } from "../lib/chargebacks/detail-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

test("late A response cannot overwrite selected B", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const displayed: Array<string | null> = [];

  const coordinator = createDetailRequestCoordinator(
    id => id === "A" ? a.promise : b.promise,
    value => displayed.push(value)
  );

  const first = coordinator.select("A");
  const second = coordinator.select("B");

  await Promise.resolve();
  b.resolve("B");
  await second;
  a.resolve("A");
  await first;

  assert.equal(displayed.at(-1), "B");
  assert.ok(!displayed.includes("A"));
});

test("closing prevents late detail from returning", async () => {
  const pending = deferred<string>();
  const displayed: Array<string | null> = [];

  const coordinator = createDetailRequestCoordinator(
    () => pending.promise,
    value => displayed.push(value)
  );

  const first = coordinator.select("A");
  await Promise.resolve();
  await coordinator.select(null);

  pending.resolve("A");
  await first;

  assert.equal(displayed.at(-1), null);
  assert.ok(!displayed.includes("A"));
});

test("late A rejection cannot clear B", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const displayed: Array<string | null> = [];

  const coordinator = createDetailRequestCoordinator(
    id => id === "A" ? a.promise : b.promise,
    value => displayed.push(value)
  );

  const first = coordinator.select("A");
  const second = coordinator.select("B");

  await Promise.resolve();
  b.resolve("B");
  await second;

  a.reject(new Error("A failed"));
  await first;

  assert.equal(displayed.at(-1), "B");
});

test("selection change immediately clears previous detail", async () => {
  const pending = deferred<string>();
  const displayed: Array<string | null> = [];

  const coordinator = createDetailRequestCoordinator(
    () => pending.promise,
    value => displayed.push(value)
  );

  const first = coordinator.select("A");
  await Promise.resolve();
  pending.resolve("A");
  await first;

  const second = coordinator.select("B");
  assert.equal(displayed.at(-1), null);

  coordinator.dispose();
  await second;
});
