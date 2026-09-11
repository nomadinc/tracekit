import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deduplicateEverflowClicks } from "../lib/integrations/everflow-click-dedup";

type Click = {
  transactionId: string;
  clickAt: string;
  sourceId: string;
  payloadHash: string;
};

const scope = {
  organizationId: "organization",
  connectionId: "connection",
  providerAccountId: "provider-account",
};
const root = fileURLToPath(new URL("../../", import.meta.url));
const click = (
  transactionId: string,
  sourceId = "source-a",
  clickAt = "2026-09-10T20:00:00.000Z",
): Click => ({
  transactionId,
  sourceId,
  clickAt,
  payloadHash: `${transactionId}:${sourceId}:${clickAt}`,
});

test("deduplicates an exact durable click identity", () => {
  const original = click("tid-1");
  const result = deduplicateEverflowClicks({
    ...scope,
    clicks: [original, { ...original }],
  });
  assert.equal(result.normalizedRowCount, 2);
  assert.equal(result.deduplicatedRowCount, 1);
  assert.equal(result.duplicateObservationsRemoved, 1);
  assert.deepEqual(result.clicks, [{ ...original }]);
});

test("removes duplicates that would share a 500-row persistence batch", () => {
  const result = deduplicateEverflowClicks({
    ...scope,
    clicks: [click("duplicate"), click("unique"), click("duplicate")],
  });
  assert.deepEqual(
    result.clicks.map((row) => row.transactionId),
    ["duplicate", "unique"],
  );
});

test("deduplicates across the persistence batch boundary", () => {
  const clicks = Array.from({ length: 500 }, (_, index) =>
    click(`tid-${index}`),
  );
  clicks.push(click("tid-0", "latest"));
  const result = deduplicateEverflowClicks({ ...scope, clicks });
  assert.equal(result.deduplicatedRowCount, 500);
  assert.equal(result.duplicateObservationsRemoved, 1);
  for (let offset = 0; offset < result.clicks.length; offset += 500) {
    const batch = result.clicks.slice(offset, offset + 500);
    assert.equal(
      new Set(batch.map((row) => row.transactionId)).size,
      batch.length,
    );
  }
});

test("deduplication precedes row mapping and every 500-row upsert slice", () => {
  const source = readFileSync(
    `${root}/ui/lib/integrations/everflow-clicks.ts`,
    "utf8",
  );
  const deduplicateAt = source.indexOf(
    "const deduplication = deduplicateEverflowClicks(input)",
  );
  const mapAt = source.indexOf("deduplication.clicks.map");
  const sliceAt = source.indexOf("rows.slice(", mapAt);
  assert.ok(deduplicateAt >= 0);
  assert.ok(mapAt > deduplicateAt);
  assert.ok(sliceAt > mapAt);
});

test("latest normalized observation deterministically supplies mutable fields", () => {
  const earlier = click("tid-1", "old", "2026-09-10T19:00:00.000Z");
  const later = click("tid-1", "new", "2026-09-10T20:00:00.000Z");
  const result = deduplicateEverflowClicks({
    ...scope,
    clicks: [earlier, later],
  });
  assert.equal(result.clicks[0], later);
  assert.equal(result.clicks[0].sourceId, "new");
  assert.equal(result.clicks[0].clickAt, later.clickAt);
  assert.equal(result.clicks[0].payloadHash, later.payloadHash);
});

test("unique rows remain unchanged and in provider order", () => {
  const clicks = [click("tid-1"), click("tid-2"), click("tid-3")];
  const result = deduplicateEverflowClicks({ ...scope, clicks });
  assert.deepEqual(result.clicks, clicks);
  assert.equal(result.duplicateObservationsRemoved, 0);
});

test("replaying the same normalized set remains idempotent", () => {
  const clicks = [click("tid-1"), click("tid-2"), click("tid-1", "new")];
  const first = deduplicateEverflowClicks({ ...scope, clicks });
  const replay = deduplicateEverflowClicks({ ...scope, clicks });
  assert.deepEqual(replay, first);
});

test("the complete durable scope participates in identity", () => {
  const observations = [click("tid-1"), click("tid-1", "new")];
  const firstScope = deduplicateEverflowClicks({ ...scope, clicks: observations });
  const secondScope = deduplicateEverflowClicks({
    ...scope,
    providerAccountId: "another-provider-account",
    clicks: observations,
  });
  assert.equal(firstScope.deduplicatedRowCount, 1);
  assert.equal(secondScope.deduplicatedRowCount, 1);
  assert.equal(firstScope.clicks[0].sourceId, "new");
  assert.equal(secondScope.clicks[0].sourceId, "new");
});
