# Recovery Preview URL registration and application handoff

User completed WorkOS dashboard authentication. Verified exact Staging environment/application and added only recovery Preview callback and root sign-out URLs for https://tracekit-staging-5bmzzfyf8-tracekit.vercel.app. Candidate775cbec41b1d937ea59a56d47276ae1a0ecc1c36 and deploymentdpl_21SY95PQASdmA9RiDoANK6VebD8s are unchanged.

Callbacks18→19; sign-out entries8→9. Another workstream's preexisting sign-out entry was present at inspection and retained. Existing entries/defaults were not changed. Both additions saved/reopened; screenshots attached. A browser dispatch timeout occurred before the first logout Save action; inspection showed it remained pending, then it was saved and reopened. No duplicate entry was created.

Fresh navigation to recovery Preview reached its correctly scoped WorkOS Staging AuthKit login. This is the application's separate authentication session, not the dashboard session. Existing authorized Admin email was entered and the existing password challenge appeared. No password/code was handled, no reset or sign-up was invoked. User browser authentication is required to continue. Root navigation/auth challenge is not proof of persisted identity or Core read acceptance.

All independent prerequisites are complete: same-project managed credential recovery and branch-only correction, exact-SHA redeployment, environment comparison, safe preflight with independent6/0/0, and exact new WorkOS URLs. Next: authenticated identity/membership, Customers, Orders, allowed workspace, Admin/client separation, foreign-denial, chargeback read permissions, persistence, logout/re-login and callback recovery. No new role acceptance claimed before sign-in. No key entry is needed from user.

Prior evidence and tested commits remain unchanged. All PRs draft. ProductionV1HOLD; WS001monetaryHOLD; Metainactive/uncertified. No membership, credential rotation, financial/provider actions or production changes. Registration rollback, if requested, removes only the two new5bm URLs, retaining defaults and all prior entries.
