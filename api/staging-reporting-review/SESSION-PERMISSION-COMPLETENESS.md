# Focused session permission completeness correction

Exact parent: 5208115d6739000f11040b91fbb5daca5e3e97ff. Affected donor: 1832473b54b8735c5d1686b864376a3f47999820, verified bundle SHA256 383180b89a8cd54f128ba9e2301c1e6442aa8b0c221a26c1312ec8778612bbd4. No external branch was overwritten.

## Before / after

The retained original page-session.ts executes two reads of a capped override array. A complete source contains an allow plus `deny orders.view`; the cap omits the denial. The old code admits orders.view despite the denial because identical repeated responses pass its graph comparison. The regression executes the original source bytes, not a reconstructed imitation. It records this as ORIGINAL SECURITY FAIL.

The corrected reader requests count=exact and requires Preference-Applied=count=exact plus canonical Content-Range covering the entire returned result. Truncated body/total disagreement, absent count, unexpected role or >50 rows rejects with503. It never continues with a page prefix or retries. Missing count remains a denial even for an empty override array. Every membership, permission, role, account, organization/context and protected-registry response uses that check.

Only process-private receipts minted from checked responses can enter composition; bare caller arrays and fabricated JSON PASS labels cannot substitute for them. A complete zero-override response permits reviewed role defaults; an unproven empty response does not. Duplicate IDs and duplicate/conflicting same-scoped capability overrides reject. Known explicit denies are applied after all allows/defaults. Malformed/unknown permission capabilities reject rather than silently disappearing.

The response carries a closed authorityEvidence read-set summary. WS-021's resolver refuses absent or incomplete summaries before constructing a page session. The summary is trusted only as an output of the authenticated authority endpoint; it is not an independently signed approval or a database snapshot certificate. Both regular refresh and organization selection invoke the same complete graph. Cookie-only organization switching cannot bypass that read.

The corrected authority also computes reporting-token issuance and current-membership answers from the same effective protected permissions. It rejects version/user/organization drift between registry lookup and that graph. A session denial therefore cannot be bypassed by calling /issue against a stale permissive registry allowlist.

## Source integration

WS-021's actual relational reader and organization-switch contract were composed into the latest WS-001 reporting tree. The prior temporary session_context JSON model/module was removed. The page entrypoint and auth callback retain preview/restricted fences and use the read-only resolver; callbacks perform no identity/audit writes. The organization route changes only session cookies after successful authorized resolution, never database records. This is an isolated joint integration candidate; independent WS-021/WS-022 acknowledgment is still pending.

All four accepted Profit runtime files are byte-identical to9d1cc0f (profit.ts, repository.ts, computed.ts, worker.ts). REPORTING_PROFIT_SNAPSHOT_CONTRACT is unchanged and remains unset in staging. The224 migration bytes, financial triggers, WS030 and separate V6 artifact were not changed.

## Verification

    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/permission-completeness.test.ts api/src/staging-reporting/session.test.ts api/src/staging-reporting/authority.test.ts

30 PASS /0 FAIL /0 SKIP. Full focused integration:95 PASS /0 FAIL /0 SKIP. Authority bundle syntax succeeds and contains no legacy service-role key, identity repository, synchronizeUser or audit-writer symbols. No full TypeScript/build acceptance is claimed beyond the focused bundle and executable tests.

## Remaining native requirements

No SQL was executed, no grants applied and no credentials activated. Exact read projections and credential roles are in SESSION-AUTHORITY-CONTRACT.json. The tk_stg_session_reader role, issuer/custody, pre-request purpose/route restrictions and underlying column ACL/RLS coverage require separate review/installation. Correct counts prove only the filtered visible set: native RLS must prove that all applicable denial rows are visible to this protected reader. A truncated or inaccessible authority graph must stay unavailable.

Two complete collections detect visible drift; they are NOT a transactional snapshot or proof against cross-relation/ABA races. Native acceptance must establish transaction/revision-fenced authority consistency under concurrent revocation, along with exact-count/main-read behavior, server caps, pool roles, PUBLIC/inherited/SET ROLE closure, timeouts and UNKNOWN outcomes. These remain activation blockers. There is no claim of native security acceptance.

Staging activation HOLD. Production V1 HOLD. Submit this exact source delta to WS022.
