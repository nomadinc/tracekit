import nextVitals from 'eslint-config-next/core-web-vitals';

// Keep the pre-migration lint contract. New React Compiler rules require a
// separate application review; no previously enabled rule is disabled here.
const compatibilityRules = {
  "react-hooks/static-components": "off",
  "react-hooks/use-memo": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/incompatible-library": "off",
  "react-hooks/immutability": "off",
  "react-hooks/globals": "off",
  "react-hooks/refs": "off",
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/error-boundaries": "off",
  "react-hooks/purity": "off",
  "react-hooks/set-state-in-render": "off",
  "react-hooks/unsupported-syntax": "off",
  "react-hooks/config": "off",
  "react-hooks/gating": "off"
};

export default [
  { ignores: ['.next/**', '.next-build/**', 'node_modules/**', 'next-env.d.ts'] },
  ...nextVitals,
  { rules: compatibilityRules },
];
