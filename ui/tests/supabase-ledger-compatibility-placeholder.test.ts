import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const migrations = new URL("supabase/migrations/", root);
const canonicalName = "20260922034620_fix_commas_journey_repair_status.sql";
const compatibilityName = "20260922034633_fix_commas_journey_repair_status.sql";
const productionBodyHash = "fb5461bf6aa5bdcf853a7bbdb039123345a548bb3e80e86e931e51d0229896b3";
const readMigration = (name: string) => readFileSync(new URL(name, migrations), "utf8");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

test("remote-only duplicate has one comment-only compatibility identity", () => {
  const files = readdirSync(migrations).filter((file) => file.endsWith(".sql"));
  assert.equal(files.includes(canonicalName), true);
  assert.equal(files.includes(compatibilityName), true);

  const compatibility = readMigration(compatibilityName);
  const executable = compatibility
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();

  assert.equal(executable, "");
  assert.equal(compatibility.includes(";"), false);
  assert.match(compatibility, new RegExp(productionBodyHash));
  assert.match(compatibility, /compatibility placeholder only/i);
  assert.match(compatibility, /intentionally contains no executable SQL/i);
});

test("canonical journey-repair body stays unique and hash locked", () => {
  const canonical = readMigration(canonicalName);
  assert.equal(sha256(canonical), productionBodyHash);
  assert.match(canonical, /create or replace function public\.repair_unassigned_commas_provider_purchase_journeys_v1/);

  const bodyOwners = readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => sha256(readMigration(file)) === productionBodyHash);
  assert.deepEqual(bodyOwners, [canonicalName]);
});

test("deployable migration versions remain unique", () => {
  const versions = readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.match(/^(\d+)_/)?.[1])
    .filter((version): version is string => Boolean(version));
  assert.equal(new Set(versions).size, versions.length);
});
