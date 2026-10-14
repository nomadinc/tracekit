import parser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import policy from './scripts/lint-policy.mjs';
import reactX from 'eslint-plugin-react-x';

// Native React/Next/accessibility/import diagnostics live in .oxlintrc.json.
// Use npm run lint for BOTH engines. No evolving recommended presets here.
const compilerDeferrals = Object.fromEntries([
  'static-components', 'use-memo', 'preserve-manual-memoization',
  'incompatible-library', 'immutability', 'globals', 'refs',
  'set-state-in-effect', 'error-boundaries', 'purity', 'set-state-in-render',
  'unsupported-syntax', 'config', 'gating',
].map(name => [`react-hooks/${name}`, 'off']));

export default [
  { ignores: ['.next/**', '.next-build/**', 'node_modules/**', 'next-env.d.ts', 'out/**', 'build/**'] },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: {
      parser, ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    plugins: { 'react-hooks': hooks, 'ws022-policy': policy, 'react-x': reactX },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...compilerDeferrals,
      'ws022-policy/no-deprecated-react': 'error',
      'ws022-policy/no-relative-location': 'warn',
      'ws022-policy/no-html-link-for-pages': 'error',
      // Complements the native createClass check for memo/forwardRef wrappers.
      'react-x/no-missing-component-display-name': 'error',
      'ws022-policy/default-wrapper-display-name': 'error',
    },
  },
];
