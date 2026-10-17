# WS 024 NI DB 002 exact failure evidence

**Status: complete evidence handoff; NI-DB-002 remains FAIL / open. Production V1 remains HOLD.**

All **32 original invalid-record digest cases** return a SHA-256 digest instead of rejecting. This package preserves their original inputs, expected REJECT assertions, SQL statements and historical logs, and supplies a new read-only native replay with directly captured SQLSTATE and per-case no-write observations. It makes no claim that these internal records can be committed through an authoritative writer.

## Verified sources

- WS-024 preparation commit: `676e4d49fe1ea15f81f5bbc41699228d75ed5e61`.
- Reviewed WS-001 candidate: `55759aa3d9724b49f09850cd3a2d9395471ec51f`.
- Contract: `NI-AUTH-001/Model-B/v1 — review-assembly-2`.
- Contract SHA-256: `9a0baa2812a6b4825b1e378f6a695e37458363d8575fbffcf6b8300f8123ca71`.
- Exact source metadata, Git verification and copied-blob provenance: `SOURCE-COMMITS.txt`, `logs/source-verification.json`, `logs/file-provenance.json`.

Both source checkouts matched their stated HEADs, had no tracked/staged changes, and passed `git fsck --full`. The corrected candidate has only the previously recorded untracked dependency symlink. Its bundle/history/contract verification is preserved in `logs/candidate-verification.original.json`. This archive copies the relevant source blobs and original evidence; it does not ship a Git bundle or claim to distribute full Git history.

## Native execution and observed result

The bounded handoff replay used **PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2), aarch64**, in the existing isolated `ws024-corrections-postgres` cluster, published at `127.0.0.1:56832`, database `ni_disposable_suite`. `version()`, transaction mode and actual installed digest/encoder definitions are recorded in `logs/handoff-replay-results.json` and raw stdout. No database setup, migration, grant change or production access occurred during this handoff.

The portable runner executed all 32 exact original SELECTs in `BEGIN READ ONLY`, recording `psql :SQLSTATE` immediately after each query. Every case returned its original digest and SQLSTATE **`00000`**. This is an observed successful SQL completion code, not a rejection or an invented exception. Server-exception diagnostics are absent (`null`); the extraction diagnostic category is `SUCCESSFUL_HELPER_EVALUATION_OF_INVALID_RECORD`.

The Python replay exited **1** because all 32 unchanged rejection assertions failed. psql returned 0 because the SQL statements succeeded. The separate preparation runner's original result was 13 PASS / 32 FAIL across 45 probes; this package isolates precisely its 32 failing record cases. Returned hashes match both that log and the previous corrected-candidate raw SQL log for every case.

## Write observations and limits

For **each case**, counts and SHA-256 hashes of sorted complete rows were captured before and after the helper SELECT for observations, current projection, links, deliveries, audit events, outbox and audit-stream state. All seven match. Read-only mode was `on`, and the transaction ended with `ROLLBACK`. No observation, projection, audit or outbox record committed in this replay; audit sequence/digest state did not advance. These are observed per-case helper-replay facts, not inferred authoritative rejection.

The original baseline helper logs did not contain equivalent per-case persistence snapshots; this handoff does not retroactively add that observation to the old execution. The new snapshot evidence is separately labeled in `cases.json`.

A related previous direct-RPC probe submitted each internal record object as a raw delivery payload, received `22023`, and preserved a batch snapshot. That is malformed delivery-envelope rejection. It **does not test the corresponding authoritative internal writer/validator**, and it is not evidence that the 32 internal-record assertions are satisfied. There are **0 demonstrated authoritative persistence-boundary failures**, with **authoritative boundary behavior UNTESTED** for these assertions. Zero demonstrated failures is not a passing result.

## Exact cases

Every row expects **REJECT**, invokes `ni_security.digest(text,jsonb)` (which calls `ni_security.canonical(jsonb)`), and is classified **HELPER_ONLY / FAIL**. Input bytes are `fixtures/<test-id>.json`; each maps to its exact index in the untouched `fixtures/vectors.original.json`. `cases.json` includes raw input, source pointer, exact SQL, returned value, directly observed SQLSTATE, diagnostics, per-case write observations and untested-boundary scope. `cases.csv` provides a flat index.

| Test ID | Returned digest instead of rejection |
| --- | --- |
| `missing-observation` | `589b3fec80b11886c1cf7aa8e382b7bcb54b6263ce40ca2457c41b91a213b6ff` |
| `extra-observation` | `419721446b4224a5ed4f018d5055ad5eb3cde0a5b8506208c0dd01365cec2977` |
| `missing-current_projection` | `a2204f84b8b228c3c5d58d4bb57b297824faec91e585cfcc6d76b3d2300d616a` |
| `extra-current_projection` | `74955e497f43391037d8dbecdcaa0f2e3efe2429f910e4db07426ce57c4e7f1c` |
| `missing-journey_link` | `6eb8a8066d372b8acd14fc113c6d2c11af0f31f52224d4748899feb9202862a9` |
| `extra-journey_link` | `f61fc4e23e225e4e58585a1d4f9db947ca836fb958f765ba7463dae3713cf50f` |
| `missing-credential_authorization` | `a5ca3f44f112956cee904321556115647899d71c79e681f9cec7bd6502d02889` |
| `extra-credential_authorization` | `aff47f2cfbfb5568da796ac44c2155d6fc5ab58d38eb778df922e5d4681caff0` |
| `missing-tenant_binding` | `0b8dccd493983dd0616a484e5cc67b5e2d1b580111c49018985e156bcae3e916` |
| `extra-tenant_binding` | `851dc065aeb98b0f086ca60f5771d5572807c34517f5ac01717f388bedc13d75` |
| `missing-credential_grant` | `7fba922be6d5398a2e319a14a76871e9643df2a3d93d66f6d3f5794c2897f938` |
| `extra-credential_grant` | `804251cbf8900dd6501029326e196b3c40846a3b8fda1268b239c14be080bade` |
| `missing-authorization_audit` | `8f8ff2e24fe8df1e1d94bbef592c2a3f6963137153b45719159c84b1780c14ee` |
| `extra-authorization_audit` | `fac069fddfdf49dcd0b9e6c4fb2588bc01a0fbc3c10d86ada40b6d6fdf0828f7` |
| `missing-observation_audit` | `85191314cfde2fb7557a917bfc8ae0b0bdc9409178e5d07f9025e650a19ea18b` |
| `extra-observation_audit` | `6c1d3876400530d38c985838548a62eb28ecddf46d882fde0511a20b49cc3dd7` |
| `missing-protected_outbox` | `62f39a0a9db34a9a1e030236e860ef4603927457928a1f7b9146710053261bdd` |
| `extra-protected_outbox` | `c8cd515fd827b6286bae3d63cefcc0f58eab037482f786584fc19fd938ca4f8d` |
| `missing-independent_receipt` | `5e44a49ca39fd9122dce96d4de0d71ec454e3239216c9efa5c6ccb2b0368c057` |
| `extra-independent_receipt` | `89d68e5e2e94f2e3be6a4dbb9f3fcf3c57a4fc6d9722010e6e05b9406adc155a` |
| `missing-source_evidence` | `b45b97ba3c8880681279fd5b850933e529d6e46e5fd2194e90b783ef1e4b0e29` |
| `extra-source_evidence` | `a6a0b3efba0eb00e10c64ded38d78ecbd1278773433eb4504316662c1ef34f5a` |
| `missing-credential_commitment` | `b3d42badce3832c667319067a9609f258152f03f69f7f48f69d226385bbb852d` |
| `extra-credential_commitment` | `4beae4c9adbd265118f10d81db6e84edccd16841ad87c5ab6186d8814832a34d` |
| `missing-quarantine_receipt` | `b4e020d81c2a370f9eea06475cc59d7e456eb0c188b8fe1fb6b64b6151aa5fe8` |
| `extra-quarantine_receipt` | `c6f1d24fc4d8afb730abf9996ae772d32c78e9cd51e854c688f1d9f2136a1076` |
| `missing-audit_stream_state` | `80216b3bcd97288b87bfac04ed2ea2a3251fa08983e08d20a84e71006f4b3886` |
| `extra-audit_stream_state` | `d420ffbede2c76fec512ca1f2bd4f9b8e83580b036acd309a21a14b910cdaf52` |
| `missing-export_state` | `afaca6ef5de57ac8e163bd172b39b971060dd886a2ef20089db71996d6bdbc5c` |
| `extra-export_state` | `a9fb7d8063c302918d13f746ff456aedbcd45d3357f0daedeb7a7ca57ab2b1a4` |
| `out-of-range-integer` | `4d328fa302ec5da989e7c961b11d0f68f154f10b07512a2fcb71339b1869aed6` |
| `required-nonnull` | `a86e745ee981f870a15bd10574af17ce3b73eade8adebcfc04bfac976a62036e` |

## Preserved files and assertions

`fixtures/vectors.original.json`, `fixtures/digest-vectors.original.sql`, original runner/assertion files under `scripts/`, and all `logs/*.original.*` are byte-for-byte copies. `logs/file-provenance.json` records their original repository paths, exact hashes and candidate source blobs. All 32 extracted raw JSON files match the unescaped original SQL input literals byte-for-byte, including exact numeric tokens and Unicode; no floating-point decode/re-encode was used. `fixtures/original-record-boundaries.json` preserves the original typed-input convention. No normalized manifest output was invented: this replay exercises the original JSONB helper invocation, not a separate authoritative manifest-normalization stage.

Original logs remain intact, including baseline unexpected digest results, corrected-candidate returned hashes, the preparation runner's failed assertions, and previous raw-ingress context. The exact 32 statements are also supplied as `fixtures/negative-statements.exact.sql`. The newly executed SQL is separately captured as `logs/handoff-replay.executed.sql`.

## Reproduction and integrity

Exact commands and optional isolated setup instructions are in `REPRODUCE.md`. The new portable replay uses only Python 3 and psql; it does not depend on the historical runners' absolute paths or Node dependencies. Actual installed helper definitions and native server version are captured in the new log.

`SHA256SUMS.txt` covers every payload file by relative path, including the scripts, fixtures, original logs and reports. It excludes only itself; the separately published archive SHA-256 covers the entire archive including the manifest. Run `python3 scripts/verify_package.py` after verifying the archive sidecar. That also checks all 32 inputs against their original SQL literals, expected rejection assertions and CSV/JSON inventory. Extraction-derived files are distinguished from unchanged originals.

## Independent access and next action

The archive and its SHA-256 sidecar are published on a dedicated evidence-only branch in the named repository `nomadinc/tracekit`; the final handoff supplies immutable publication-commit URLs and the verified downloaded archive hash. Publication changes only evidence files and does not merge or deploy. No credentials, private key or customer data are included; fixtures and identifiers are synthetic test material.

WS-001 must identify the permitted authoritative writer/validator for each internal record type, determine reachability and resolve the helper/contract discrepancy without relaxing these negative cases. WS-022 independently determines impact and acceptance requirements. This evidence extraction makes no remediation change and closes neither security finding. No production mutations, credential rotations, Edge canary changes, merges, deployments or customer activation are authorized or performed. **Production V1 remains HOLD.**
