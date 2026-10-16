# WS-022 working-deployment comparison and managed recovery

No user-supplied key is required. Existing authorized Supabase management access recovered an existing server credential for confirmed project `uoeosoiegatlqtzemsfv`. The selected managed secret passed a zero-row identity-table read and was securely reused in the previously authorized branch-only Preview override. No key was created or rotated.

## Deployment and scope comparison

| Item | Working WS-022 deployment | Failing WS-022 deployment | Recovery deployment |
|---|---|---|---|
| Vercel project | tracekit-staging | tracekit-staging | tracekit-staging |
| Deployment | dpl_6v7oRFdwYX3TbGpz5PwgsPQCUytF | dpl_A1VTcr4pBbYmMGn2xFEXYUjnX3wR | dpl_21SY95PQASdmA9RiDoANK6VebD8s |
| SHA | bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6 | 775cbec41b1d937ea59a56d47276ae1a0ecc1c36 | 775cbec41b1d937ea59a56d47276ae1a0ecc1c36 |
| Branch | ws022/maintained-lint-stack | ws022/acceptance-runtime-diagnosis | ws022/acceptance-runtime-diagnosis |
| Environment | Preview | Preview | Preview |
| Identity endpoint variable | NEXT_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL |
| Server credential variable | SUPABASE_SERVICE_ROLE_KEY | SUPABASE_SERVICE_ROLE_KEY | SUPABASE_SERVICE_ROLE_KEY |
| Supabase project | uoeosoiegatlqtzemsfv | uoeosoiegatlqtzemsfv | same intended project; endpoint unchanged |
| Identity credential scope | General Preview snapshot | General Preview snapshot | New exact-branch Preview Secret override |
| Live result | Authenticated Control Center still loads | Identity gateway401 | READY; application checks pending callback registration |

The working deployment was created at 2026-10-15 02:30:23.440 UTC. The current general Preview key entry was updated at 05:00:09.656 UTC. The failing deployment was created at 05:52:15.208 UTC. This chronology and the currently working older deployment support an environment-revision explanation, but do not identify the older deployment's captured key or prove which particular update caused the rejection. Deployment API env arrays may be redacted; no secret snapshot extraction was attempted.

The separate `tracekit` Vercel project also has these same variable names, separate Preview/production entries, and a production endpoint targeting the same Supabase project. Its endpoint was read as public configuration; no production credential was retrieved and no production mutation or fresh application acceptance was performed there. This additional comparison is metadata evidence, not permission to change that project.

Branch overrides for other workstreams remain separate. Vercel matching branch Preview variables override general Preview values: https://vercel.com/docs/environment-variables . The previously added Core credential selector remains independent of Supabase identity authentication.

## Recovery path and authorized server-side checks

Supabase's installed CLI supports read-only project API-key inventory and retrieval using existing management authentication. The exposed MCP capability only lists publishable keys, so the authenticated CLI was the supported server-side recovery path. No credential was requested from the user or extracted from an old application's runtime.

The existing legacy service credential returned401 in a GET of `/rest/v1/tracekit_users?select=id&limit=0`. Both existing managed secret credentials returned200 with an empty result on the confirmed same project, using apikey only. No member records were returned. The existing TraceKit-managed secret was selected. These checks prove endpoint read acceptance, not identity synchronization writes, tenant authorization or full application acceptance. No cause for the legacy rejection or historical rotation is asserted.

The identity repository already supports modern server secrets through apikey without Bearer, so no application code change was needed. The separate reviewer corroborated that compatibility, minimality and the limits of a zero-row read. This is independent source/evidence assessment, not independent browser acceptance.

## Applied minimal correction

Under the user's earlier conditional authorization, created only `SUPABASE_SERVICE_ROLE_KEY`, type Secret, target Preview, branch `ws022/acceptance-runtime-diagnosis`, entry `t4sxLPrCSTGrmUCO`. The endpoint and every existing variable were retained. Inventory39→40: all39 previous IDs/scopes/types/update times unchanged. No general Preview, production or other workstream setting changed.

The credential was transferred through a restricted temporary input file and the authenticated Vercel API. It was never printed, placed in command arguments, chat, GitHub or evidence. Temporary credential-bearing inventory/input files were removed; the response was reduced to metadata only. Public evidence includes only variable names, project identity, scope metadata and read-check statuses.

Redeployed exact SHA `775cbec41b1d937ea59a56d47276ae1a0ecc1c36`. Resulting Preview is READY at https://tracekit-staging-5bmzzfyf8-tracekit.vercel.app; source SHA and branch verified. No production deployment or promotion.

## Remaining access and acceptance

The current Chrome session changed and its WorkOS dashboard session is signed out. The user has been asked to authenticate the prepared dashboard page so only the exact new Preview callback and root sign-out URLs can be registered as previously authorized. No key entry is needed. Once registered, verify identity synchronization/session resolution, Customers, Orders, client/Admin scopes, foreign-tenant denial and governed permissions without executing live financial/provider actions. Until then, no updated application acceptance is claimed.

Rollback removes only the new branch-specific Secret override, retaining the general Preview entry, all other branches and production configuration. Do not rotate or disable the reused managed credential. Prior code/test/database and WS-024 evidence retains its original commits. All PRs remain draft. WS-001 monetary certification HOLD; Meta inactive and uncertified; Production V1 HOLD.
