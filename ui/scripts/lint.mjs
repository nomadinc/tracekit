import { ESLint } from 'eslint';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const paths = process.argv.slice(2).filter(x => x !== '--json');
const targets = paths.length ? paths : ['app', 'components', 'lib'];
const eslint = new ESLint();
const results = await eslint.lintFiles(targets);
const native = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url)),
  '--config', '.oxlintrc.json', '--format', 'json', ...targets,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (native.error || ![0, 1].includes(native.status)) {
  process.stderr.write(native.stderr || String(native.error)); process.exit(2);
}
const nativeResult = JSON.parse(native.stdout);
if (!Array.isArray(nativeResult.diagnostics)) throw new Error('Invalid native lint output');
const errors = results.reduce((n, r) => n + r.errorCount, 0)
  + nativeResult.diagnostics.filter(d => d.severity === 'error').length;
const warnings = results.reduce((n, r) => n + r.warningCount, 0)
  + nativeResult.diagnostics.filter(d => d.severity === 'warning').length;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ eslint: results, oxlint: nativeResult, errors, warnings }, null, 2));
} else {
  console.log(await (await eslint.loadFormatter('stylish')).format(results));
  for (const d of nativeResult.diagnostics) console.log(`${d.filename}:${d.labels?.[0]?.span?.line ?? ''} ${d.severity} ${d.code} ${d.message}`);
  console.log(`Combined lint: ${errors} errors, ${warnings} warnings.`);
}
process.exitCode = errors > 0 || native.status === 1 ? 1 : 0;
