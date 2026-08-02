import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assetPathsFromHtml, missingManifestAssets } from "../scripts/next-lifecycle-lib.mjs";

test("review readiness extracts generated CSS and JavaScript assets", () => {
  assert.deepEqual(assetPathsFromHtml('<link href="/_next/static/css/app/layout.css?v=1"><script src="/_next/static/chunks/app.js?v=1"></script>'), [
    "/_next/static/css/app/layout.css?v=1",
    "/_next/static/chunks/app.js?v=1",
  ]);
});

test("manifest validation fails when a referenced asset is missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "tracekit-next-assets-"));
  mkdirSync(join(directory, "static/css"), { recursive: true });
  writeFileSync(join(directory, "build-manifest.json"), JSON.stringify({ files: ["static/css/app.css", "static/chunks/app.js"] }));
  writeFileSync(join(directory, "static/css/app.css"), "body{}");
  assert.deepEqual(missingManifestAssets(directory), ["static/chunks/app.js"]);
});
