import { getStringIfConstant, findVariable } from '@eslint-community/eslint-utils';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Repository-owned compatibility policies, NOT external maintained equivalents.
// Their API contract is pinned to reviewed React18; an upgrade requires review.
const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (dependencies.react !== '18.3.1') throw new Error('Review the React deprecation lint contract before changing React.');
const modules = { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/server': 'ReactDOMServer', 'react-addons-perf': 'ReactPerf' };
export const deprecatedReactPaths = [
  'React.renderComponent', 'React.renderComponentToString', 'React.renderComponentToStaticMarkup',
  'React.isValidComponent', 'React.PropTypes.component', 'React.PropTypes.renderable',
  'React.isValidClass', 'this.transferPropsTo', 'React.addons.classSet', 'React.addons.cloneWithProps',
  'React.render', 'React.unmountComponentAtNode', 'React.findDOMNode', 'React.renderToString',
  'React.renderToStaticMarkup', 'React.addons.LinkedStateMixin', 'ReactPerf.printDOM',
  'Perf.printDOM', 'ReactPerf.getMeasurementsSummaryMap', 'Perf.getMeasurementsSummaryMap',
  'React.createClass', 'React.addons.TestUtils', 'React.PropTypes', 'React.DOM',
  'ReactDOM.render', 'ReactDOM.hydrate', 'ReactDOM.unmountComponentAtNode', 'ReactDOMServer.renderToNodeStream',
];
const deprecated = new Set(deprecatedReactPaths);
const lifecycles = new Set(['componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate']);
const propertyName = node => node?.computed ? node.property?.value : node?.property?.name;
const keyName = node => node?.key?.name ?? node?.key?.value;

const reactPolicy = {
  meta: { type: 'problem', schema: [], messages: { deprecated: '{{path}} is deprecated in the reviewed React18 contract.' } },
  create(context) {
    const aliases = new Map();
    const factories = new Set();
    function path(node, raw = false) {
      if (node?.type === 'Identifier') return (!raw && aliases.get(findVariable(context.sourceCode.getScope(node), node))) || node.name;
      if (node?.type === 'ThisExpression') return 'this';
      if (node?.type === 'MemberExpression') {
        const base = path(node.object, raw), key = propertyName(node);
        return base && typeof key === 'string' ? `${base}.${key}` : null;
      }
      if (node?.type === 'CallExpression' && node.callee.name === 'require') return modules[node.arguments[0]?.value] ?? null;
      return null;
    }
    function report(node, value) {
      if (deprecated.has(value)) context.report({ node, messageId: 'deprecated', data: { path: value } });
    }
    function bind(pattern, base) {
      if (!base) return;
      if (pattern.type === 'Identifier') { aliases.set(findVariable(context.sourceCode.getScope(pattern), pattern), base); return; }
      if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) {
        if (p.type !== 'Property') continue;
        const value = `${base}.${keyName(p)}`;
        report(p, value);
        bind(p.value, value);
      }
    }
    function checkLifecycle(node) {
      const members = node.type === 'ObjectExpression' ? node.properties : node.body.body;
      const parent = node.parent;
      const factory = node.type === 'ObjectExpression' && parent?.type === 'CallExpression'
        && (path(parent.callee) === 'React.createClass' || parent.callee.name === 'createReactClass' || factories.has(findVariable(context.sourceCode.getScope(parent.callee), parent.callee)));
      const componentClass = node.type !== 'ObjectExpression' && (
        ['React.Component', 'React.PureComponent'].includes(path(node.superClass))
        || ['Component', 'PureComponent'].includes(node.superClass?.name)
      );
      if (!factory && !componentClass) return;
      for (const p of members) if (lifecycles.has(keyName(p))) context.report({ node: p.key, messageId: 'deprecated', data: { path: keyName(p) } });
    }
    return {
      ImportDeclaration(node) {
        const base = modules[node.source.value];
        if (node.source.value === 'create-react-class') for (const s of node.specifiers) factories.add(findVariable(context.sourceCode.getScope(s.local), s.local));
        if (!base) return;
        for (const s of node.specifiers) {
          if (s.type === 'ImportSpecifier') {
            const value = `${base}.${s.imported.name ?? s.imported.value}`;
            report(s, value); aliases.set(findVariable(context.sourceCode.getScope(s.local), s.local), value);
          } else aliases.set(findVariable(context.sourceCode.getScope(s.local), s.local), base);
        }
      },
      VariableDeclarator(node) {
        bind(node.id, path(node.init));
        if (node.init?.type === 'CallExpression' && node.init.callee.name === 'require'
          && node.init.arguments[0]?.value === 'create-react-class' && node.id.type === 'Identifier') factories.add(findVariable(context.sourceCode.getScope(node.id), node.id));
      },
      MemberExpression(node) {
        // Preserve upstream textual checks even when a nested binding has the
        // same name; alias expansion is additional scope-bound protection.
        const raw = path(node, true);
        report(node, deprecated.has(raw) ? raw : path(node));
      },
      ClassDeclaration: checkLifecycle, ClassExpression: checkLifecycle, ObjectExpression: checkLifecycle,
    };
  },
};

const absolute = /^(?:[a-z][\d+.a-z-]*:|\/\/)/i;
const prefixes = new Set(['window', 'globalThis', 'document', 'self']);
function locationRoot(node) {
  if (node?.type === 'Identifier' && node.name === 'location') return node;
  if (node?.type === 'MemberExpression' && node.object.type === 'Identifier'
    && prefixes.has(node.object.name) && propertyName(node) === 'location') return node.object;
  return null;
}
function staticPrefix(node, source, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  const value = getStringIfConstant(node, source.getScope(node));
  if (value !== null) return value;
  if (node.type === 'TemplateLiteral') return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  if (node.type === 'BinaryExpression' && node.operator === '+') return staticPrefix(node.left, source, seen);
  if (node.type === 'Identifier') {
    const variable = findVariable(source.getScope(node), node);
    const def = variable?.defs.at(-1);
    if (def?.type !== 'Variable') return null;
    let expression = def.node.init;
    for (const ref of variable.references) {
      if (ref.identifier.range[0] >= node.range[0]) break;
      if (ref.isWrite() && ref.writeExpr) expression = ref.writeExpr;
    }
    return staticPrefix(expression, source, seen);
  }
  return null;
}
const locationPolicy = {
  meta: { type: 'problem', schema: [], messages: { relative: 'Use a Next.js router or redirect for relative location navigation.' } },
  create(context) {
    const source = context.sourceCode;
    function check(node, target, value) {
      const root = locationRoot(target);
      if (!root) return;
      const global = source.scopeManager.scopes[0].set.get(root.name);
      if (!global || global.defs.length || !global.references.some(r => r.identifier === root)) return;
      const prefix = staticPrefix(value, source);
      if (prefix !== null && !absolute.test(prefix)) context.report({ node, messageId: 'relative' });
    }
    return {
      CallExpression(node) {
        if (node.callee.type === 'MemberExpression' && propertyName(node.callee) === 'assign'
          && node.arguments[0]?.type !== 'SpreadElement') check(node, node.callee.object, node.arguments[0]);
      },
      AssignmentExpression(node) {
        if (node.left.type === 'MemberExpression' && propertyName(node.left) === 'href') check(node, node.left.object, node.right);
      },
    };
  },
};
const pageExtension = /\.(?:js|jsx|ts|tsx)$/;
function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
export function routePattern(parts) {
  const segments = parts.filter(p => p && !p.startsWith('(') && !p.startsWith('@'));
  const pattern = segments.map(p => {
    if (/^\[\[\.\.\..+\]\]$/.test(p)) return '(?:/.*)?';
    if (/^\[\.\.\..+\]$/.test(p)) return '/.+';
    if (/^\[.+\]$/.test(p)) return '/[^/]+';
    return '/' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${pattern || '/'}/?$`);
}
const htmlPolicy = {
  meta: { type: 'problem', schema: [], messages: { page: 'Use next/link for navigation to the application page {{href}}.' } },
  create(context) {
    const root = context.cwd;
    const routes = [];
    for (const name of ['app', 'src/app', 'pages', 'src/pages']) {
      const directory = join(root, name);
      for (const file of walk(directory).filter(f => pageExtension.test(f))) {
        const parts = relative(directory, file).split(sep);
        const base = parts.pop().replace(pageExtension, '');
        if (name.endsWith('app')) { if (base !== 'page') continue; }
        else {
          // Preserve Pages Router index aliases and legacy file-route checks.
          if (base === 'index') routes.push(routePattern(parts));
          parts.push(base);
        }
        routes.push(routePattern(parts));
      }
    }
    return { JSXOpeningElement(node) {
      if (node.name.name !== 'a') return;
      const attributes = node.attributes.filter(a => a.type === 'JSXAttribute');
      if (attributes.some(a => a.name.name === 'download')
        || attributes.some(a => a.name.name === 'target' && a.value?.value === '_blank')) return;
      const href = attributes.find(a => a.name.name === 'href')?.value;
      if (href?.type !== 'Literal' || typeof href.value !== 'string') return;
      const path = href.value.split(/[?#]/, 1)[0].replace(/\/index\.html$/, '/');
      if (routes.some(route => route.test(path))) context.report({ node, messageId: 'page', data: { href: href.value } });
    } };
  },
};
// Native display-name handles createClass; React-X handles assigned wrappers.
// Its collector currently skips anonymous default wrapper exports.
const defaultWrapperNamePolicy = {
  meta: { type: 'problem', schema: [], messages: { name: 'Give the default memo/forwardRef component a display name.' } },
  create(context) {
    const wrappers = new Set();
    const namespaces = new Set();
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') return;
        for (const specifier of node.specifiers) {
          const variable = findVariable(context.sourceCode.getScope(specifier.local), specifier.local);
          if (specifier.type !== 'ImportSpecifier') namespaces.add(variable);
          else if (['memo', 'forwardRef'].includes(specifier.imported.name)) wrappers.add(variable);
        }
      },
      ExportDefaultDeclaration(node) {
      let value = node.declaration;
      if (value?.type !== 'CallExpression') return;
      while (value?.type === 'CallExpression') {
        const callee = value.callee;
        const scope = context.sourceCode.getScope(callee);
        const recognized = callee.type === 'Identifier'
          ? wrappers.has(findVariable(scope, callee))
          : callee.type === 'MemberExpression' && ['memo', 'forwardRef'].includes(propertyName(callee))
            && callee.object.type === 'Identifier' && (callee.object.name === 'React' || namespaces.has(findVariable(scope, callee.object)));
        if (!recognized) return;
        value = value.arguments[0];
      }
      if (value?.type === 'ArrowFunctionExpression' || (value?.type === 'FunctionExpression' && !value.id))
        context.report({ node: value, messageId: 'name' });
    } };
  },
};
export default { rules: {
  'no-deprecated-react': reactPolicy,
  'default-wrapper-display-name': defaultWrapperNamePolicy,
  'no-relative-location': locationPolicy,
  'no-html-link-for-pages': htmlPolicy,
} };
