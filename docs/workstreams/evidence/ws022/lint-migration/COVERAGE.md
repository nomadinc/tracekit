# WS-022 lint coverage

Baseline: `88f7411457b988e83e51fbc9bf7b4b5b76002fe7`. All 48 enabled entries below retain severity/options. Fourteen React Compiler deferrals remain disabled. The test contract asserts this inventory.

| Baseline rule | Severity | Replacement | Options |
|---|---|---|---|
| react/display-name | 2 | react/display-name, react-x/no-missing-component-display-name, ws022-policy/default-wrapper-display-name | [] |
| react/jsx-key | 2 | react/jsx-key | [] |
| react/jsx-no-comment-textnodes | 2 | react/jsx-no-comment-textnodes | [] |
| react/jsx-no-duplicate-props | 2 | react/jsx-no-duplicate-props | [] |
| react/jsx-no-undef | 2 | react/jsx-no-undef | [] |
| react/jsx-uses-react | 2 | semantic JSX binding marker; neither configuration enables unused-variable diagnostics | [] |
| react/jsx-uses-vars | 2 | semantic JSX binding marker; neither configuration enables unused-variable diagnostics | [] |
| react/no-children-prop | 2 | react/no-children-prop | [] |
| react/no-danger-with-children | 2 | react/no-danger-with-children | [] |
| react/no-deprecated | 2 | ws022-policy/no-deprecated-react | [] |
| react/no-direct-mutation-state | 2 | react/no-direct-mutation-state | [] |
| react/no-find-dom-node | 2 | react/no-find-dom-node | [] |
| react/no-is-mounted | 2 | react/no-is-mounted | [] |
| react/no-render-return-value | 2 | react/no-render-return-value | [] |
| react/no-string-refs | 2 | react/no-string-refs | [] |
| react/no-unescaped-entities | 2 | react/no-unescaped-entities | [] |
| react/require-render-return | 2 | react/require-render-return | [] |
| react-hooks/rules-of-hooks | 2 | react-hooks/rules-of-hooks | [] |
| react-hooks/exhaustive-deps | 1 | react-hooks/exhaustive-deps | [] |
| @next/next/google-font-display | 1 | nextjs/google-font-display | [] |
| @next/next/google-font-preconnect | 1 | nextjs/google-font-preconnect | [] |
| @next/next/next-script-for-ga | 1 | nextjs/next-script-for-ga | [] |
| @next/next/no-async-client-component | 1 | nextjs/no-async-client-component | [] |
| @next/next/no-before-interactive-script-outside-document | 1 | nextjs/no-before-interactive-script-outside-document | [] |
| @next/next/no-css-tags | 1 | nextjs/no-css-tags | [] |
| @next/next/no-head-element | 1 | nextjs/no-head-element | [] |
| @next/next/no-html-link-for-pages | 2 | ws022-policy/no-html-link-for-pages | [] |
| @next/next/no-img-element | 1 | nextjs/no-img-element | [] |
| @next/next/no-location-assign-relative-destination | 1 | ws022-policy/no-relative-location | [] |
| @next/next/no-page-custom-font | 1 | nextjs/no-page-custom-font | [] |
| @next/next/no-styled-jsx-in-document | 1 | nextjs/no-styled-jsx-in-document | [] |
| @next/next/no-sync-scripts | 2 | nextjs/no-sync-scripts | [] |
| @next/next/no-title-in-document-head | 1 | nextjs/no-title-in-document-head | [] |
| @next/next/no-typos | 1 | nextjs/no-typos | [] |
| @next/next/no-unwanted-polyfillio | 1 | nextjs/no-unwanted-polyfillio | [] |
| @next/next/inline-script-id | 2 | nextjs/inline-script-id | [] |
| @next/next/no-assign-module-variable | 2 | nextjs/no-assign-module-variable | [] |
| @next/next/no-document-import-in-page | 2 | nextjs/no-document-import-in-page | [] |
| @next/next/no-duplicate-head | 2 | nextjs/no-duplicate-head | [] |
| @next/next/no-head-import-in-document | 2 | nextjs/no-head-import-in-document | [] |
| @next/next/no-script-component-in-head | 2 | nextjs/no-script-component-in-head | [] |
| import/no-anonymous-default-export | 1 | import/no-anonymous-default-export | [] |
| jsx-a11y/alt-text | 1 | jsx-a11y/alt-text | [{"elements": ["img"], "img": ["Image"]}] |
| jsx-a11y/aria-props | 1 | jsx-a11y/aria-props | [] |
| jsx-a11y/aria-proptypes | 1 | jsx-a11y/aria-proptypes | [] |
| jsx-a11y/aria-unsupported-elements | 1 | jsx-a11y/aria-unsupported-elements | [] |
| jsx-a11y/role-has-required-aria-props | 1 | jsx-a11y/role-has-required-aria-props | [] |
| jsx-a11y/role-supports-aria-props | 1 | jsx-a11y/role-supports-aria-props | [] |

## Engine, resolver and ignore behavior

Both engines run for `npm run lint`; `npm run build` runs that command before Next compilation. Native errors stop the build, proved with a synthetic sync-script error. Next's old partial ESLint integration is disabled only because this explicit full gate replaces it. Running `eslint` alone is incomplete.

Baseline JS/JSX used the Next Babel parser; TS/TSX used typescript-eslint. The new JS/JSX/TS/TSX parser is typescript-eslint 8.71.2 plus native Oxc parsing. Both accept JSX, browser/Node globals and modules. No type-aware lint rules existed or were added. Representative effective configurations are exported separately for all four types.

Baseline node resolver extensions `.js,.jsx,.ts,.tsx`, TypeScript `alwaysTryTypes:true`, import parser suffixes `.ts,.mts,.cts,.tsx,.d.ts` are recorded in raw snapshots. The only enabled import rule was `no-anonymous-default-export`, which does not resolve imports. No unresolved-import or cycle diagnostic is removed; unused resolver packages are removed. TypeScript still validates application imports.

Ignore union remains `.next/**`, `.next-build/**`, `node_modules/**`, `next-env.d.ts`, `out/**`, `build/**`. Both lint commands target app/components/lib. Snapshots and file inventories document scope parity. ESLint unused-disable reporting remains warning; existing directives apply to Hooks in that engine. No application suppressions were introduced.

## Exact compatibility gaps and ownership

No externally maintained drop-in equivalent was established for the complete old React deprecation table or Next relative-location rule. Native page-link checking incorrectly flags route handlers such as the existing Meta OAuth endpoint. The repository policies preserve all 28 React API paths and three lifecycles, static relative navigation detection with global scope checks, and actual page-route navigation. React-X covers assigned memo/forwardRef display names; native covers ordinary anonymous component exports/createClass; the fourth local policy fills React-X's anonymous default-wrapper gap.

These are **repository-owned policies**, not externally maintained equivalents or risk exceptions. Tracekit frontend/tooling owner must explicitly accept maintenance of the four compatibility policies, including contract tests, or select another supported implementation before approval. React deprecation behavior is pinned to React 18.3.1 and fails closed if that dependency changes. No force install, legacy peer mode, new dependency override, finding suppression or waiver was used.

Page-link discovery deliberately uses actual App Router `page` files and excludes route handlers. It fixes upstream App Router recursion/trailing-slash inconsistencies; Pages index aliases and `/index.html` normalization remain protected. Dynamic, catchall, optional catchall, route groups and parallel segments are recognized. Literal anchors with download or target blank retain exemptions.

## Warning and dependency disposition

The expected lint result remains zero errors and nine warnings: five Hooks dependency warnings and four relative-location warnings, at unchanged source locations. The four framework warning identifiers/messages change to the compatibility-policy name. No application source was changed to reduce warnings.

The old five high package records traced to braces through eslint-config-next → @next/eslint-plugin-next/eslint-plugin-import → fast-glob → micromatch → braces. Removing this lint-only chain removes the advisory rather than suppressing it. The old React plugin peer excluded ESLint 10; Hooks 7.1.1 explicitly supports ESLint 10, typescript-eslint 8.71.2 supports ESLint 10, React-X supports ESLint *, and native Oxlint has no ESLint peer. Exact resolved versions and peers are recorded in the dependency tree. Existing production overrides are unchanged.

Clean install may still print inherited package deprecation notices (ExcelJS/archive dependencies); audit findings and peer validity are assessed separately, not waived by those notices.

## Rollback

Keep PR #575 and its reviewed candidate untouched. Close this dependent draft PR or revert its migration commits on its tooling branch; restore ui/package.json, package-lock.json, eslint.config.mjs and next.config.mjs from the parent, remove the newly added lint scripts/config, then run npm ci. This restores the prior lint stack and its known high advisory/peer blocker, so it does not authorize release. No database, provider or credential rollback is needed. Never merge or promote this branch as part of rollback.

Authenticated role/tenant staging acceptance remains blocked on existing authorized member access. Inherited WS-024 database evidence and all PR #575 acceptance provenance remain unchanged. Affiliate/source monetary reporting awaits WS-001 certification; Meta stays inactive/uncertified; Production V1 remains HOLD.
