# WS-022 preview rollback and release boundary

Candidate88f7411457b988e83e51fbc9bf7b4b5b76002fe7, deployment dpl_7kVc4eqTa3QseM9rMyRjGXkFhZ3U, immutable preview https://tracekit-staging-38p6rybzt-tracekit.vercel.app, team Tracekit, project tracekit-staging. No production alias/promote/rollback was performed; default production/staging domains were not repointed by the agent. Automatic branch previews are separate deployments.

There is no previous release to restore for this isolated preview. If rejected, stop using this exact preview and keep it unpromoted; retain PR and evidence for review. An owner may later remove/restrict only this preview under separate authorization. Do not run vercel rollback/promote: those commands change production routing. Do not substitute any older deployment as accepted WS-022 evidence.

No candidate migration was applied remotely. Therefore no database rollback is executed or proposed. The additive nullable-currency migration and inherited WS-024 chain still require fresh disposable validation before a separately authorized release. Do not drop currency columns or infer/backfill USD. No provider sync/financial operation was activated, so there is no provider/financial reversal.

Release owner keeps Production V1 HOLD until tooling decision, staged access/tenancy/governed/UI acceptance, required database proof, WS-001 certification, and explicit production authorization. Meta activation needs its own certification/authorization. Callback and logout configuration are managed by the staging identity owner; do not remove shared redirect settings as a rollback shortcut.
