import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// These suites import server-only application modules. Preserve that boundary
// by using Node's React Server condition, rather than mocking server-only away.
const serverSuites = new Set([
  "m11-shopify-webhook-rollback.test.ts", "m17-shopify-webhook-remediation.test.ts",
  "mcp-read-service.test.ts", "meta-oauth-foundation.test.ts",
  "ws020-mcp-customer-boundary.test.ts",
]);
const files = readdirSync("tests").filter(name => name.endsWith(".test.ts")).sort();
const requested = process.argv.slice(2);
const selected = requested.length ? requested.map(path => path.replace(/^tests\//, "")) : files;
if (selected.some(name => !files.includes(name))) throw new Error("Unknown test suite requested.");
let failed = false;
for (const server of [false, true]) {
  const group = selected.filter(name => serverSuites.has(name) === server);
  if (!group.length) continue;
  const result = spawnSync(process.execPath, [...(server ? ["--conditions=react-server"] : []), "--import", "tsx", "--test", ...group.map(name => `tests/${name}`)], { stdio: "inherit" });
  if (result.error || result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
