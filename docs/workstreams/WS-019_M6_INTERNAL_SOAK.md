# WS-019 M6 — Internal Controlled-Production Soak

Baseline: `main` @ `d77e568e6e142dc5cbd3d9a7464867e4b4c6136d`

Duration: **7 consecutive days** from the first accepted production observation.

## Frozen V1 boundary

No capability expansion during soak.

- Shopify controlled reversible proof: PRODUCTION PROVEN; human-controlled only.
- Shopify ingestion repair: READ-ONLY FINDING.
- Everflow bounded remediation: READ-ONLY FINDING.
- Commas test delivery: ENGINEERING READY / NOT LIVE PROVEN; disabled.
- Generic/autonomous provider mutation: NOT SUPPORTED.
- Notifications: in-app Notification Center only.

## Daily acceptance observations

Capture once per day without provider mutation:

1. Production deployment SHA/configuration identity.
2. Intelligence/MCP tool inventory and action-matrix drift.
3. Current Health/finding outcomes, including healthy/no-action/insufficient-evidence states where present.
4. Work Item counts, recurrence, dismissals, and unexpected reopenings.
5. Notification counts/dedupe and governed-action notification state.
6. Audit History availability and tenant scope.
7. Runtime errors relevant to Intelligence/MCP/operational routes.
8. Provider remediation signals (read-only only).
9. Safe-disable configuration remains available; no need to repeat the live toggle daily.
10. Any P0/P1 defect, unexplained provider call, autonomous mutation, tenant leak, audit gap, duplicate notification storm, or evidence-loss condition.

## Immediate soak failure conditions

- Any autonomous/unconfirmed provider mutation.
- Any cross-tenant disclosure or mutation.
- Any governed action bypassing prepare → confirmation → execute → verify/replay.
- Loss/corruption of durable action or audit evidence.
- Safe-disable cannot suppress an executable action.
- Persistent P0/P1 Intelligence defect.
- False-positive recurrence/dismissal regression that can cause unsafe remediation.
- Notification behavior that materially obscures an execution/verification failure.

## Soak PASS

Seven consecutive accepted daily observations with no failure condition, no unresolved P0/P1 Intelligence defect, and no expansion of the frozen V1 boundary.

M6 PASS permits M7 final Production Readiness Declaration review. It does not itself declare Production V1 ready.
