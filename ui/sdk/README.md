# TraceKit Journey browser SDK releases

`lib/tkid/browser-client.ts` is the sole behavioral implementation. The browser entry only exposes it as the immutable `window.TraceKitJourney` namespace.

Build and verify version 1.0.0:

```sh
npm run build:tkid-sdk
node scripts/verify-tkid-sdk-release.mjs 1.0.0
```

The pinned build emits no source map, timestamp, or random content and refuses to replace different bytes or metadata in an existing release directory. Behavioral changes require a new version and directory. Release CI may set `TRACEKIT_SDK_SOURCE_COMMIT` to a full Git SHA; otherwise the checked-out commit is recorded.

## Universal declarative tag (1.1.0)

Version 1.1.0 adds the universal tag. It fetches a source/origin-bound,
immutable declarative definition and owns bootstrap, ordered page/funnel event
delivery, trusted CTA delegation, bounded retry, and teardown. Merchants supply
no behavioral JavaScript:

```html
<script src="https://app.trace-kit.io/sdk/tkid/1.1.0/tracekit.js"
  data-source="PUBLIC_SOURCE_ID" async></script>
```

An optional `data-config-version` pins a numeric definition version. The tag
defaults only the API origin (`https://api.trace-kit.io`); source, page, funnel,
CTA, and selector values are delivered as approved configuration. Definitions
allow exact path matching and at most 32 pages / 16 CTAs per page. CTA matching
is limited to a safe semantic marker, one class, one ID, or an exact
`data-tracekit-cta` selector. There are no combinators, wildcard selectors,
pseudo-selectors, extraction rules, callbacks, or arbitrary event fields.

Build without publishing:

```sh
npm run build:tkid-universal-sdk
```

## Public API

The script exposes `TraceKitJourney.version`, `TraceKitJourney.init(config)`, and `TraceKitJourney.TraceKitJourneyClient`. Clients support `startJourney`, `trackPageView`, `trackFunnelStep`, `viewOffer`, `trackCta`, `decideOffer`, `startCheckout`, `submitCheckout`, `confirmPurchase`, `confirmationViewed`, `receiptObserved`, `vslMilestone`, `clientError`, `handoffJourney`, `consumeHandoff`, and `flush`.

```html
<script src="https://app.trace-kit.io/sdk/tkid/1.0.0/tracekit-journey.min.js"
  integrity="SHA384_VALUE_FROM_MANIFEST" crossorigin="anonymous"></script>
<script>
  const journey = TraceKitJourney.init({
    endpoint: "https://api.trace-kit.io",
    publicSourceId: "PUBLIC_SOURCE_ID",
    privacyMode: "essential",
    autoPageView: false,
    onError: ({ code, phase }) => console.warn("TraceKit unavailable", code, phase),
  });
</script>
```

Initialization is idempotent for the endpoint/source/privacy/auto-page-view tuple. A duplicate same-version script preserves the installed global; a different version fails instead of replacing it. Identity remains in `sessionStorage`; no cookie or local-storage identity is introduced. Network failures retain at most 20 safe events for a later explicit `flush`. M1 terminal responses stop further retries for that client and discard its queue.

SPA navigation remains explicit through `trackPageView`; `autoPageView` only records the initial path after bootstrap. Event delivery uses `fetch(..., {keepalive:true})`; the SDK installs no unload listener, so a merchant may call `flush()` from its existing lifecycle hook. The first configuration supplied for an idempotency tuple owns its optional error callback.

## Hosting and CSP

Use the existing first-party Vercel application host, `https://app.trace-kit.io`. Publishing is intentionally separate. An authorized release copies the verified directory to `ui/public/sdk/tkid/1.0.0`, configures `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: public, max-age=31536000, immutable`, and `Access-Control-Allow-Origin: *`, deploys, then downloads and hashes both files against the manifest. It must fail if the remote version exists with different bytes.

Future EcoWatt CSP additions are exact and wildcard-free:

```text
script-src https://app.trace-kit.io
connect-src https://api.trace-kit.io
```

The SDK requires neither `unsafe-inline` nor `unsafe-eval`. A merchant-owned inline initialization snippet still needs its normal nonce/hash, or can live in an allowed external script.

## Release gate

1. Check out the approved source commit and set `TRACEKIT_SDK_SOURCE_COMMIT`.
2. Run `npm ci`, SDK tests, the production build, and two clean SDK builds.
3. Verify the manifest with `verify-tkid-sdk-release.mjs`.
4. Obtain separate publication authorization.
5. Refuse to overwrite an existing version locally or remotely.
6. Stage the exact files on the selected host, deploy, download, and compare SHA-256/SRI/size.
7. Record deployment and source commit. Merchants pin the versioned URL, never a mutable alias.
