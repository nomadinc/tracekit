# Independent WS-022 lint migration review

Reviewer: separate Codex review agent `/root/lint_independent_review`, not the implementation author. Reviewed code commit: `65d5cdef3d0d3021d256f88c1abb7122fb5a1486`, based on reviewed PR #575 candidate `88f7411457b988e83e51fbc9bf7b4b5b76002fe7`.

Disposition: suitable for a separate **draft** tooling PR and owner review. No unresolved implementation defect found in the final inspected diff. This is not acceptance of the four repository-owned policies as externally maintained equivalents, a risk waiver, authenticated staging acceptance, or production authorization.

## Review scope and findings

Independently inspected the effective baseline configuration, rule mapping, both engine configurations, combined lint runner/build gate, installed original React/Next rule implementations, compatibility policies and synthetic checks. The application auth, tenancy, authorization, API/render currency and Meta source files are unchanged by this migration; their earlier acceptance limitations remain.

The review identified and implementation corrected these substantive issues:

- A name-keyed React alias map let a nested declaration hide an outer deprecated API diagnostic. The map is now scope-bound and retains original textual-path checks. The original failure was reproduced against both original and replacement configurations.
- A render-method heuristic classified unrelated classes as React components. It was removed; lifecycle aliases and factories are scope-bound with compatibility fallbacks.
- Native Next page-link checking flags a legitimate route-handler anchor. The route-aware policy preserves literal page-navigation checks without changing OAuth application behavior. Optional catchall parent matching, Pages index aliases and `/index.html` normalization were corrected during review.
- Maintained React-X alone misses anonymous default memo/forwardRef exports. An explicit repository policy supplements it; raw React pragma/CJS namespace, imported aliases, nested wrappers and named/non-React controls were checked.

A later production build exposed a harness defect: an empty synthetic `ui/pages` directory survived cleanup and made Next infer a hybrid router. Reviewed the correction: the suite records whether Pages existed beforehand, deletes its synthetic page, and removes only a newly created empty directory with non-recursive `rmdir`. Existing directories are preserved. Independent final execution confirms no `pages` or `.lint-contract-*` fixture directory remains. No application nullability change was used. The harness mutates temporary files within the source tree; execute it serially relative to TypeScript/build traversal. A concurrent author TypeScript run encountered a removed-fixture race and is being rerun serially; this is not a parallel-safe harness.

The author also corrected native diagnostic-count handling in the runner. Independent execution confirms that a deliberate native error makes both the combined lint command and build fail before Next compilation.

## Independent execution

At exact code commit `65d5cdef3d0d3021d256f88c1abb7122fb5a1486`, ran from `ui`:

```text
node --test scripts/lint-contract.test.mjs
tests 4; pass 4; fail 0; skipped 0; cancelled 0
```

Raw independent output: [logs/independent-lint-contract.log](logs/independent-lint-contract.log). Final post-run cleanup check: Pages and synthetic lint fixture directories absent.

This independently re-executed the 48-entry severity/options inventory check and unchanged 14 Compiler deferrals; invalid/valid probes for all 46 diagnostic baseline rules; legacy API, scope, lifecycle and relative-navigation bridge probes; and the native-error/build-gate check. Earlier independent execution caught the display-name failure before its fix (3 passed, 1 failed); the final run resolves it.

Additional independent lintText probes verified default raw React.memo, CJS React.memo and imported alias wrappers are rejected, while a non-React `foo.memo` and a named inner function remain allowed. These supplement the authored contract suite, rather than substituting for its final exact-commit run.

## Required owner decision and limits

The complete React deprecation union, Next relative-location policy, route-aware Next page-link behavior and anonymous default-wrapper supplement are explicitly repository-maintained. No full external maintained equivalent was established. The frontend/tooling owner must accept maintenance responsibility for those four policies and their contracts, or select another supported implementation, before approval. This review does not make that decision.

The combined `npm run lint` is the authoritative command; ESLint alone is incomplete. The documented nine warnings remain warnings. Dependency audits, reproducible install, full UI tests, TypeScript and successful production compilation are recorded by the execution owner; this independent review does not mislabel those author-run results as its own.

Authenticated member/tenant staging remains blocked on existing authorized member access. WS-001 financial certification remains required, Meta remains inactive and uncertified, and Production V1 remains HOLD.
