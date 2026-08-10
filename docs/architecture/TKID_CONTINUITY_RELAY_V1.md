# TKID Continuity Relay v1

## Purpose and boundary

The relay preserves a bounded first-party TKID Journey across a configured external checkout that does not echo TKID parameters. It is continuity Evidence, not proof of purchase, identity matching, attribution, or customer profiling. It uses no fingerprint, IP linkage, email linkage, third-party cookie, or heuristic matching.

The proposed production origin is `https://journey.trace-kit.io`, configured by `TRACEKIT_TKID_RELAY_ORIGIN`. `TRACEKIT_TKID_RELAY_ENABLED` defaults to `false`. DNS, certificates, CSP, Commas return URLs, managed-origin activation, source activation, and flow activation are separate approvals.

This implementation is local only. DNS has not been created, the relay has not been deployed, no production flow is enabled, the Commas return URL is unchanged, all production origins remain inactive, the TKID source remains disabled, and no production traffic has been collected.

## Route and trust contract

- `POST /v1/tkid/relay/initiate/:flowKey` is called from an ACTIVE managed source origin. It resolves the source and flow server-side and verifies that the Journey, browser session, and checkout session already exist in the same Organization and Business Context.
- `GET /v1/tkid/relay/out/:flowKey?init=<opaque>` consumes a one-time opaque initiation reference, sets a host-only continuity cookie, and redirects only to the flow's configured HTTPS checkout destination.
- `GET /v1/tkid/relay/return/:flowKey` resolves the opaque cookie, revalidates the configured ACTIVE destination origin, issues the existing five-minute destination-bound TKID handoff, clears the relay cookie, and redirects.
- The existing TKID handoff consume endpoint restores the Journey and marks relay continuity consumed.

No route accepts a browser-controlled destination. Flow keys are globally unique bounded identifiers. Checkout destinations and their approved host are server-managed. Source and return origins reference the managed-origin registry.

## Cookie and concurrency

The cookie is `__Host-tkid_relay_<flowKey>`, contains only 256 bits of random opacity, and is stored server-side only as SHA-256. Production attributes are `HttpOnly; Secure; SameSite=Lax; Path=/`, with no Domain attribute. The 90-minute TTL fits inside the two-hour TKID Journey lifetime while allowing checkout and upsell completion. Top-level Lax navigation does not rely on third-party-cookie behavior.

Different flows have distinct cookies. For the same browser session and flow, the database permits only one open continuity. A second concurrent initiation fails closed and returns the configured checkout URL so checkout can continue without a new continuity attachment. It never replaces Journey A with Journey B.

## Lifecycle, Evidence, and failure

Continuity states are `issued`, `outbound`, `returned`, `handoff_issued`, `consumed`, `expired`, `failed`, and `erased`. Typed relay Evidence is limited to checkout handoff started, external checkout returned, handoff issued/consumed, and continuity broken. A relay return is observed return Evidence, not purchase confirmation; canonical financial truth remains provider/Commerce Evidence.

Missing cookies, expiry, duplicate return, unavailable handoff signing, or storage failure never trigger heuristic reattachment. Where an ACTIVE configured return origin exists, the buyer is redirected there without TKID handoff and continuity remains incomplete. Responses disclose no tenant, cookie, token, PII, raw IP, or query-bearing redirect URL.

Distributed `relay_out` and `relay_return` counters use the existing Supabase fixed-window adapter. Expired rows are cleanup-eligible after their short operational TTL. TKID Journey erasure tombstones relay rows and typed milestones while leaving canonical Commerce unchanged.

## Production configuration preview

```text
TRACEKIT_TKID_RELAY_ORIGIN=https://journey.trace-kit.io
TRACEKIT_TKID_RELAY_ENABLED=false

flow_key=accufy-main-oto
status=draft
source_origin=https://pushthesystem.com
checkout_destination=<approved HTTPS Commas checkout URL>
return_origin=https://pushbuttonsystem.net
continuity_ttl_seconds=5400
```

Additional candidate return origins are `https://systemsthatpush.com` and `https://pushingsystems.com`. All candidate origins remain PENDING. The preview does not create a flow row, activate an origin/source, modify DNS/CSP, or change Commas.
