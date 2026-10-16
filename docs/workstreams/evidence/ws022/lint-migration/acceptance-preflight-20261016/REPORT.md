# WS-022 resumed acceptance and safe configuration preflight

Application candidate remains775cbec41b1d937ea59a56d47276ae1a0ecc1c36. Recovery deployment dpl_21SY95PQASdmA9RiDoANK6VebD8s is stillREADY at https://tracekit-staging-5bmzzfyf8-tracekit.vercel.app, exactsourceSHAverified. Historical dpl_A1VTcr4pBbYmMGn2xFEXYUjnX3wR remains the rejected general-Preview identity snapshot; it is not the recovery deployment.

Previously authorized managed recovery is preserved: one branch-only Preview SUPABASE_SERVICE_ROLE_KEY Secret, matching project uoeosoiegatlqtzemsfv, with all39 prior environment entries unchanged. Current metadata still selects that branch Secret and general Preview NEXT_PUBLIC_SUPABASE_URL. The earlier working deployment and timing comparison remain in managed-credential-recovery/REPORT.md. Opaque historical secret snapshot identity remains unobservable through redacted metadata; no claim that an exact old key value was identified.

Fresh current managed credential check:200, zero rows, checked2026-10-16T20:37:09.330930UTC, management credential obtained only in process memory. No secret values or authentication headers printed or persisted. This reconfirms project/key read acceptance, not the Vercel runtime snapshot or identity write acceptance.

## Configuration check added

Standalone tool: tools/ws022/preview-preflight.mjs, tests and operator/environment mapping in tools/ws022/README.md on the evidence/tooling branch. No application candidate change.

Metadata mode checks exact Vercel project/SHA/branch/readiness, required branch-only sensitive identity Secret, URL scope and Core selector scope. Current metadata mode passed and explicitly reports application acceptance unchecked. Default complete mode requires trusted managed runtime environment, binds runtime project/commit/ref/host to the checked deployment, checks exact Supabase endpoint and selector, and performs only GET tracekit_users?select=id&limit=0. Modern secrets use apikey only; legacy JWT credentials also use Bearer. Unexpected redirects fail closed. All failures use fixed safe codes, never upstream bodies or credential data.

Independent review found three initial gaps: runtime/metadata binding, redirect handling and conflicting metadata/runtime flags. All were corrected. Separate reviewer reran six tests:6passed,0failed,0skipped; no remaining blocking tooling finding. Tests cover rejected original-style configuration, wrong deployment/runtime, wrong database or missing secret before network, 401, malformed results and transport errors without echoing secret-bearing messages.

The helper is available for future trusted Preview/CI invocation. It is not claimed as an automatically installed deployment gate, nor as having run with the current deployment's live runtime secret. Integrating it with a managed runner requires Platform/CI ownership; do not export or ask the user to paste a Secret. This limitation is documented rather than treating metadata-only success as credential acceptance.

## Remaining required browser authentication

WorkOS dashboard is not authenticated. Its existing password attempt showed invalid credentials; executor switched to the visible email-code option and left the code challenge for the user. No password/code was read, reset or requested in chat. The user must complete their authorized dashboard sign-in so exact recovery-preview callback/root URLs can be registered while preserving prior entries/defaults.

Until registration, identity/membership loading, Customers, Orders, client/Admin separation, foreign-tenant denial, financial read permission boundaries, persistence, logout/re-login and callback recovery on the new recovery deployment remain pending. Previous case results and commits remain inherited evidence, not substitutes for this deployment. Only required browser authentication is being handed off; no Supabase key request or recovery-access blocker remains.

All PRs remain draft. No membership/provider/financial mutations, key rotation, database substitution, security waiver or production deployment. WS001 monetary certification HOLD; Meta inactive/uncertified; ProductionV1 HOLD. Prior database/WS024 evidence remains attributed to original tested commits. Recovery rollback removes only its branch Secret if separately requested; preflight rollback removes only standalone tooling/operator instructions.
