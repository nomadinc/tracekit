# Identity-storage configuration trace and proposed correction

Deployment: `dpl_A1VTcr4pBbYmMGn2xFEXYUjnX3wR`; reviewed SHA `775cbec41b1d937ea59a56d47276ae1a0ecc1c36`; Vercel project `tracekit-staging`; environment Preview; branch `ws022/acceptance-runtime-diagnosis`.

| Setting | Variable | Selected scope | Project identity |
|---|---|---|---|
| Identity REST endpoint | `NEXT_PUBLIC_SUPABASE_URL` | General Preview; no matching branch override | Supabase `uoeosoiegatlqtzemsfv`, confirmed by correlated gateway logs |
| Identity credential | `SUPABASE_SERVICE_ROLE_KEY` | General Preview; no matching branch override | Presented key rejected by that project; owner must verify association and validity |

`SupabaseIdentityTenancyRepository.configuration()` reads these two exact variables without fallback names. No tracked environment files supply an alternate value; no Next/Vercel configuration override for them was found. The credential remains server-side. Newer secret keys are sent as apikey only; legacy JWT service keys also use Bearer. Neither value was retrieved or exposed.

Vercel branch-specific Preview variables override general Preview variables of the same name. The inventory has overrides for `workstream/29next` (both variables) and `ws021/invitation-onboarding-recovery` (URL only); neither applies to this deployment's branch. Production targets do not supply Preview settings. Reference: https://vercel.com/docs/environment-variables . Deployment API env arrays may be redacted; scope inference relies on the project inventory and exact source branch, with observed project confirmed by gateway logs.

The authorized Core credential selector is separate: it affects the Core proxy credential, not this Supabase identity repository. The failure is before application membership resolution and Core Customers/Orders. No key rotation attribution is made.

## Smallest correction prepared for approval

Subject to owner verification that this is the intended Supabase project, create exactly one secret `SUPABASE_SERVICE_ROLE_KEY` override for Preview branch `ws022/acceptance-runtime-diagnosis`, using an existing valid owner-verified credential for `uoeosoiegatlqtzemsfv`. Leave the URL, general Preview entry, other branches and every production entry unchanged. No rotation, new membership, permission change or authentication bypass.

The proposal is not applied. The owner must verify the current pairing and validity first; a mismatched or invalid project assumption requires reassessment rather than silently changing the URL. The secret is to be entered by the custodian through the secure configuration workflow, never pasted into this package or chat. Metadata-only plan is PLAN.json; prepared owner request is OWNER-REQUEST.md. No named custodian/channel was found in the repository, and the user has been asked to identify them. No message to an unidentified recipient was sent.

After explicit approval and secure correction: redeploy the same SHA, verify source/environment/new URL, register exact Staging URLs if required, then verify identity resolution, allowed Customers and Orders reads, client/Admin workspace persistence, governed permissions without submitting live actions, and foreign-tenant denial with an allowed positive control. Record exact route statuses and role results. No fresh acceptance is claimed while the prerequisite is blocked.

Rollback removes only the new branch-specific secret override, preserving prior entries and defaults. No credential value belongs in rollback documentation. Prior evidence, failures, tested commits and database provenance remain intact. All PRs remain draft; Production V1 HOLD, WS-001 monetary HOLD, Meta inactive/uncertified.
