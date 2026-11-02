# Authorization callback regression closure

Exact runtime parent: `96c852b08c35856645488fc908eb128195fa9b9e`.
No application/runtime source is modified by this correction.

## Historical assertion and contract

Failing test: `real application entrypoints bypass every legacy repository and
callback write in restricted mode`, in the retained
`ui/tests/ws021-read-only-staging-session.test.ts`, original line 192.
The test's original bytes match accepted source
`02936c622cad36d21e3b46894b91f6255b3c4e25`, blob
`54551412f27394616fe7060f237415bf05f9f983`. This retained test file was not present
in the runtime parent's Git tree; the corrected file is included in this commit.

Originally it asserted that `recordAuthenticationSuccess` rejected with
`identity synchronization is disabled`. That expectation matched the older
`assertIdentityWritesAllowed` implementation. WS-001 commit
`4e468b3e64b6f3c8616bd2cf55399b9d6e03f436` deliberately replaced that callback
assertion with an immediate restricted-boundary return, before repository
construction. Explicit synchronization still throws, and legacy identity
resolution still returns null in restricted staging.

Silent callback return is the correct security behavior: this function is a
best-effort persistence observer invoked by AuthKit's verified callback. It does
not return a session, enroll membership or authorize access. Its caller already
catches persistence errors independently of provider authentication. Throwing
for an intentionally disabled write hook adds a misleading persistence-failure
diagnostic; it does not strengthen the downstream authorization boundary.
The page-session resolver must independently validate current authority evidence.

## Exact test correction

Replace only the stale rejection expectation with an assertion that the result
is `undefined`. Immediately assert zero legacy repository constructions. Then
return HTTP 403 from the intercepted authority transport and require
`resolveApplicationSession()` to return `no-membership`, proving that callback
completion cannot grant access. Existing explicit synchronization rejection and
legacy-identity denial checks remain.

`original-assertion.txt` preserves the original assertion/provenance;
`test-expectation.patch` is the exact delta against the retained accepted test.
`before.txt` preserves the real failure: 14 PASS / 1 FAIL, `Missing expected
rejection`, at the callback assertion. No production data or credentials appear.

## Reproduction and retained UI regressions

```sh
cd ui
node --conditions=react-server --import ./node_modules/tsx/dist/loader.mjs --test \
 --test-name-pattern='real application entrypoints' tests/ws021-read-only-staging-session.test.ts
node --conditions=react-server --import ./node_modules/tsx/dist/loader.mjs --test \
 tests/ws021-read-only-staging-session.test.ts tests/ws001-staging-session-boundary.test.ts \
 tests/persistent-identity.test.ts tests/auth-return-url.test.ts \
 tests/ws020-scoped-core-gateway.test.ts tests/ws023-profit-scoped-reporting.test.ts
```

After: focused callback 1 PASS / 0 FAIL; retained UI suite 57 PASS / 0 FAIL,
zero skips. Exact output is in `after-focused.txt` and `after-ui.txt`. Targeted
lint passes. The integration harness exercises the real application exports,
with a repository constructor that counts and throws if reached. The corrected
callback resolves without constructing it. All provider fetches are intercepted;
no live sign-in, database request or write occurs.

## Preservation and WS-022 handoff

Only the retained test and this evidence directory change. Runtime tree parity
with the exact parent preserves permission completeness, registry-singleton
protection, authorization/Profit snapshot default-deny and accepted Profit
behavior. No environment setting or native gate is changed. Existing synthetic
UI regressions include scoped session/refresh/switch denial checks.

WS-022 independent verification is **PENDING**, not self-attested. Review this
exact test delta, confirm runtime parity, reproduce the callback/suite commands,
and return an independent disposition. No database grants, credential activation,
SQL, push, merge or deployment is performed. Staging activation and Production V1
remain HOLD.
