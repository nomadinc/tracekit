const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = path.resolve(__dirname, '..');
const tooling = process.env.WS023_TEST_TOOLING;
if (!tooling) throw new Error('WS023_TEST_TOOLING must identify isolated React 18 tooling');
const React = require(path.join(tooling, 'node_modules/react'));
const Renderer = require(path.join(tooling, 'node_modules/react-test-renderer'));
const ts = require(path.join(ui, 'node_modules/typescript'));
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const req = id => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return require(path.join(tooling, 'node_modules/react/jsx-runtime'));
    if (id === 'lucide-react') return { CheckCircle2: () => null, ShieldCheck: () => null };
    if (id.startsWith('@/')) return load(path.join(ui, id.slice(2)) + '.ts');
    return require(id);
  };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext('(function(require,module,exports){' + js + '\n})', { console, Intl })(req, mod, mod.exports);
  return mod.exports;
}
test('mounted Order inspector renders accepted purchase facts and canonical link without a financial amount card', () => {
  const { purchaseEvidenceDrawer } = load(path.join(ui, 'lib/orders/context-drawer.ts'));
  const { OrderDrawerContent } = load(path.join(ui, 'components/orders/order-drawer-content.tsx'));
  const snapshot = {
    order: { id: 'next29:103104', customerId: 'customer', revenue: 116.99, currency: 'USD', profit: null },
    canonicalOrderId: '15f0b290-aaad-4962-b1d6-42f69db3966c',
    canonicalJourneyId: 'bc1e677e-173c-51ad-b00c-e78b4ba77ef6',
    observedReferences: { payment: null, transaction: null, evidence: 'synthetic-source-proof' },
    observedLines: [{ name: '20 Treatments (5)', sku: null, providerProductId: '8', providerVariantId: '9', quantity: 1, unitAmount: 116.99, currency: 'USD', evidenceId: 'synthetic-line-proof' }],
  };
  const event = { id: 'synthetic-event', status: 'Observed', confidence: 'Observed evidence', evidence: [], relationships: [], purchaseEvidence: { acquisition: 'Unmatched', provider: 'next29', observedAt: '2026-11-09T20:50:40Z' } };
  const record = purchaseEvidenceDrawer(snapshot, event, 'event:synthetic-event');
  let tree;
  Renderer.act(() => { tree = Renderer.create(React.createElement(OrderDrawerContent, { record })); });
  const rendered = JSON.stringify(tree.toJSON());
  for (const fact of [snapshot.canonicalOrderId, snapshot.canonicalJourneyId, '$116.99 USD', '20 Treatments (5)', 'synthetic-line-proof', 'Unmatched', 'Unavailable']) assert.ok(rendered.includes(fact), fact);
  const links = tree.root.findAllByType('a');
  assert.equal(links.length, 1);
  assert.ok(links[0].props.href.includes('journey_id=' + snapshot.canonicalJourneyId));
  assert.equal(tree.root.findAllByType('p').some(p => p.props.children === 'Amount'), false);
  const missing = purchaseEvidenceDrawer({ ...snapshot, order: { ...snapshot.order, revenue: null }, observedLines: [], canonicalJourneyId: null }, event, 'event:synthetic-event');
  Renderer.act(() => { tree.update(React.createElement(OrderDrawerContent, { record: missing })); });
  assert.ok(JSON.stringify(tree.toJSON()).includes('Unavailable USD'));
  assert.equal(JSON.stringify(tree.toJSON()).includes('$116.99'), false);
  assert.equal(tree.root.findAllByType('a').length, 0);
  Renderer.act(() => tree.unmount());
});
