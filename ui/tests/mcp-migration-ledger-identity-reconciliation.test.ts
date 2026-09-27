import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const oldVersions = ["20260926225500", "20260926232500", "20260927023500", "20260927032500"];
const reconciled = [
  ["20260926231339_mcp_action_authorization_atomic_consumption.sql", "e6ebfc3e69976024a7e63e2dec1bc4812c692a14b44f7eacf0f41c498ee365da"],
  ["20260927023307_fix_mcp_action_authorization_rpc_ambiguity.sql", "efe28595a5b09ee17fb2ac8171b87167f7a5cec2005387787e8c49044984c653"],
  ["20260927023943_mcp_action_authorization_consumption_invariant.sql", "c8d9ca85f38f12d7bd5af706d44eb4b9a64aa14859fcb0e9097303978662a716"],
  ["20260927033211_mcp_internal_marker_execution_adapter.sql", "662c3df9c4bc2490634d582773620f24e8dd072b96dff6564eb11152adab60f2"],
] as const;

test("only Production-backed MCP migration identities remain deployable", () => {
  const files = readdirSync(migrations).filter((file) => file.endsWith(".sql"));
  for (const version of oldVersions) assert.equal(files.some((file) => file.startsWith(`${version}_`)), false);
  for (const [file] of reconciled) assert.equal(existsSync(`${migrations}/${file}`), true);
});

test("filename reconciliation preserves every approved repository body hash", () => {
  for (const [file, expected] of reconciled) {
    const actual = createHash("sha256").update(readFileSync(`${migrations}/${file}`)).digest("hex");
    assert.equal(actual, expected, file);
  }
});

test("migration versions remain unique and the reconciled dependency order is exact", () => {
  const files = readdirSync(migrations).filter((file) => file.endsWith(".sql"));
  const versions = files.map((file) => file.split("_", 1)[0]);
  assert.equal(new Set(versions).size, versions.length);
  const ordered = [
    ...reconciled.map(([file]) => file),
    "20260927041927_tkid_interrupted_event_recovery_v1.sql",
  ];
  assert.deepEqual([...ordered].sort(), ordered);
});
