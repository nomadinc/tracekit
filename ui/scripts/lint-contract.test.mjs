import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deprecatedReactPaths, routePattern } from './lint-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const baseline = JSON.parse(readFileSync(new URL('../../docs/workstreams/evidence/ws022/lint-migration/baseline/tsx.json', import.meta.url)));
const fixtures = JSON.parse(readFileSync(new URL('./lint-canaries.json', import.meta.url)));
const bridge = {
  'react/no-deprecated': 'ws022-policy/no-deprecated-react',
  '@next/next/no-location-assign-relative-destination': 'ws022-policy/no-relative-location',
  '@next/next/no-html-link-for-pages': 'ws022-policy/no-html-link-for-pages',
};
export const replacement = rule => bridge[rule] ?? rule.replace('@next/next/', 'nextjs/');
const nativeCode = code => code.replace(/^next\(/, 'nextjs(').replace(/^([^()]+)\((.+)\)$/, '$1/$2');
const eslint = new ESLint({ cwd: root });

test('every enabled baseline rule has explicit equal-severity/options coverage; Compiler deferrals remain off', async () => {
  const native = JSON.parse(readFileSync(join(root, '.oxlintrc.json')));
  const config = await eslint.calculateConfigForFile(join(root, 'components/contract.tsx'));
  const markers = new Set(['react/jsx-uses-react', 'react/jsx-uses-vars']);
  for (const [rule, options] of Object.entries(baseline.rules)) {
    if (rule.startsWith('react-hooks/') && options[0] === 0) assert.deepEqual(config.rules[rule], options);
    if (!options[0] || markers.has(rule)) continue;
    assert.deepEqual(config.rules[replacement(rule)] ?? native.rules[replacement(rule)], options, rule);
  }
  assert.equal(Object.entries(baseline.rules).filter(([, v]) => v[0]).length, 48);
  assert.equal(Object.keys(native.rules).length, 41);
  assert.deepEqual(config.rules['react-x/no-missing-component-display-name'], [2]);
  // The markers only mark JSX variables as used; neither old nor new enables
  // no-unused-vars. Native semantic analysis replaces that non-diagnostic role.
  assert.equal(config.rules['no-unused-vars'], undefined);
  assert.equal(native.rules['no-unused-vars'], undefined);
});

test('all 46 diagnostic rules catch invalid examples and accept valid controls', async () => {
  const directory = mkdtempSync(join(root, '.lint-contract-'));
  const page = join(root, 'pages/ws022-lint-contract-page.tsx');
  const hadPagesDirectory = existsSync(dirname(page));
  mkdirSync(dirname(page), { recursive: true });
  writeFileSync(page, 'export default function ContractPage(){return null}');
  const observations = [];
  try {
    const all = fixtures.flatMap((fixture, index) => [
      { ...fixture, kind: 'invalid', index },
      { ...fixture, kind: 'valid', index, source: 'export const Demo = () => <div />;' },
    ]);
    for (const f of all) {
      f.path = join(directory, String(f.index), f.kind, f.file);
      mkdirSync(dirname(f.path), { recursive: true }); writeFileSync(f.path, f.source);
    }
    const native = spawnSync(process.execPath, [join(root, 'node_modules/oxlint/bin/oxlint'), '-c', '.oxlintrc.json', '-f', 'json', directory], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.ok([0, 1].includes(native.status), native.stderr);
    const diagnostics = JSON.parse(native.stdout).diagnostics;
    const results = await eslint.lintFiles([directory]);
    for (const f of all) {
      const rule = replacement(f.rule);
      const es = results.find(r => r.filePath === f.path)?.messages.filter(m => m.ruleId === rule
        || (f.rule === 'react/display-name' && ['react-x/no-missing-component-display-name', 'ws022-policy/default-wrapper-display-name'].includes(m.ruleId))) ?? [];
      const ox = diagnostics.filter(d => resolve(root, d.filename) === f.path && nativeCode(d.code) === rule);
      const severities = [...es.map(d => d.severity), ...ox.map(d => d.severity === 'error' ? 2 : 1)];
      observations.push({ rule: f.rule, replacement: rule, kind: f.kind, severities });
    }
    if (process.env.WS022_LINT_OBSERVATIONS) writeFileSync(process.env.WS022_LINT_OBSERVATIONS, JSON.stringify(observations, null, 2));
    const failures = observations.filter(o => o.kind === 'invalid' ? !o.severities.includes(baseline.rules[o.rule][0]) : o.severities.length > 0);
    assert.deepEqual(failures, []);
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(page, { force: true }); if (!hadPagesDirectory) rmdirSync(dirname(page)); }
});

test('policy bridges preserve legacy APIs, scopes, lifecycle and relative-prefix behavior', async () => {
  assert.ok(routePattern(['docs','[[...slug]]']).test('/docs'));
  assert.ok(routePattern(['docs','[[...slug]]']).test('/docs/a/b'));
  assert.ok(!routePattern(['docs','[...slug]']).test('/docs'));
  const reactRule = 'ws022-policy/no-deprecated-react';
  const locationRule = 'ws022-policy/no-relative-location';
  const probes = [
    ...deprecatedReactPaths.map(path => ({ source: `${path};`, rule: reactRule, invalid: true })),
    ...['componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate'].map(name => ({ source: `import React from 'react';class Demo extends React.Component{${name}(){} render(){return null}}`, rule: reactRule, invalid: true })),
    { source: 'import {render as legacy} from "react-dom";', rule: reactRule, invalid: true },
    { source: 'const {render: legacy}=require("react-dom");', rule: reactRule, invalid: true },
    { source: 'import React from "react"; function F(){const React=other;} React.render(x);', rule: reactRule, invalid: true },
    { source: 'class Demo extends SomeOther {render(){} componentWillMount(){}}', rule: reactRule, invalid: false },
    { source: 'import R from "react";function F(){const R=other;R.createClass();}', rule: reactRule, invalid: false },
    { source: 'import {createRoot} from "react-dom/client";createRoot(node);', rule: reactRule, invalid: false },
    ...['location','window.location','globalThis.location','document.location','self.location'].flatMap(p => [
      { source: `${p}.assign('/dashboard');`, rule: locationRule, invalid: true },
      { source: `${p}.href='/dashboard';`, rule: locationRule, invalid: true },
      { source: `${p}.assign('https://example.invalid/');`, rule: locationRule, invalid: false },
    ]),
    { source: 'window["location"]["assign"]("/dashboard");', rule: locationRule, invalid: true },
    { source: 'const url=`/orders/${id}`;window.location.assign(url);', rule: locationRule, invalid: true },
    { source: 'let url;url="/orders/"+id;window.location.assign(url);', rule: locationRule, invalid: true },
    { source: 'window.location.assign("//example.invalid/");', rule: locationRule, invalid: false },
    { source: 'function F(window){window.location.assign("/dashboard")}', rule: locationRule, invalid: false },
    { source: 'window.location.assign(...destinations)', rule: locationRule, invalid: false },
  ];
  const wrapperRule = 'ws022-policy/default-wrapper-display-name';
  probes.push(
    { source: 'export default React.memo(()=> <div/>);', rule: wrapperRule, invalid: true },
    { source: 'const React=require("react");export default React.memo(()=> <div/>);', rule: wrapperRule, invalid: true },
    { source: 'import {memo as m} from "react";export default m(()=> <div/>);', rule: wrapperRule, invalid: true },
    { source: 'import R from "react";export default R.memo(R.forwardRef(()=> <div/>));', rule: wrapperRule, invalid: true },
    { source: 'import React from "react";export default React.memo(function Named(){return <div/>});', rule: wrapperRule, invalid: false },
    { source: 'export default foo.memo(()=> <div/>);', rule: wrapperRule, invalid: false },
  );
  for (const p of probes) {
    const [result] = await eslint.lintText(p.source, { filePath: join(root, 'components/PolicyProbe.tsx') });
    assert.equal(result.messages.some(m => m.ruleId === p.rule), p.invalid, p.source);
  }
  for (const [source, invalid] of [
    ['export const Demo=()=> <a href="/dashboard">Page</a>;', true],
    ['export const Demo=()=> <a href="/v1/integrations/meta/connect">OAuth</a>;', false],
    ['export const Demo=()=> <a href="/dashboard" target="_blank">Page</a>;', false],
    ['export const Demo=()=> <a href="/dashboard" download>Page</a>;', false],
  ]) {
    const [r] = await eslint.lintText(source, { filePath: join(root, 'components/PolicyProbe.tsx') });
    assert.equal(r.messages.some(m => m.ruleId === 'ws022-policy/no-html-link-for-pages'), invalid, source);
  }
});

test('native errors fail the combined command and build before Next compilation', () => {
  const path = join(root, 'components/ws022-native-build-canary.tsx');
  writeFileSync(path, 'export const Demo=()=> <script src="https://example.invalid/canary.js"/>;');
  try {
    const lint = spawnSync(process.execPath, ['scripts/lint.mjs', path, '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(lint.status, 1);
    assert.ok(JSON.parse(lint.stdout).errors > 0);
    const build = spawnSync('npm', ['run', 'build'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(build.status, 1);
    assert.doesNotMatch(build.stdout, /Creating an optimized production build/);
    assert.match(build.stdout, /no-sync-scripts/);
  } finally { rmSync(path, { force: true }); }
});
