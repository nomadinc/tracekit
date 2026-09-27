# M10 two-session authorization race proof

This proof must use two independent PostgreSQL sessions. Sequential calls from one connector request are not accepted as concurrency evidence.

Acceptance:
1. Session A consumes the controlled authorization and deliberately holds its transaction open.
2. Session B starts while A is open and blocks on the same authorization row.
3. After A commits, B returns `replay_same_result`.
4. B returns A's persisted consumption ID/time, not B's proposed consumption ID.
5. `mcp_action_authorization_consumption_invariant` returns `invariant_ok = true`.
6. Exactly one consumed authorization row exists.
7. Controlled proof row is deleted after evidence is captured.

The harness performs no provider action. It exercises only the authorization-consumption gate.
