# Everflow Direct Linking Integration Standard

**Version:** 1.0 · **Date:** 2026-11-04 · **Scope:** Reusable across affiliate / advertiser projects

## Purpose

Standardize Everflow SDK direct linking with one advertiser network and an optional upstream partner network, preserving separate transaction IDs, native Everflow cookies, funnel handoff, and conversion-event deduplication. This document distinguishes observed MorePumps behavior from general integration guidance. It is not a claim that every SDK behavior is contractually guaranteed by Everflow.

## Core invariants

1. **Advertiser TID** belongs to the advertiser's Everflow network. On the advertiser destination URL, `_ef_transaction_id` is its existing redirect TID (blank on direct links). Advertiser TID is passed downstream to funnel steps and Checkout Champ `c1` where applicable.
2. **Partner TID** belongs to the upstream affiliate network. The advertiser click's `sub5` carries that partner TID. Never overwrite `sub5` with the advertiser TID.
3. Everflow SDK owns `ef_tid_c_o_{offerId}` and `ef_tid_c_a_{advertiserId}`. Do not manually create or overwrite SDK-owned cookies; do not introduce custom TID cookies unless an independently documented integration requires them.
4. The SDK's `transaction_id` input should receive the existing advertiser `_ef_transaction_id` when invoking the advertiser `EF.click()` (following the MCP-provided pattern). **A request with an existing TID is not proof of a new counted click**; verify responses and Everflow reporting.
5. For a new direct-link flow, obtain partner TID first (if a partner click is necessary), then send advertiser click with partner TID in `sub5`.
6. Use exactly one intended partner network; never guess by firing all configured networks.
7. Keep offer/affiliate identifiers distinct across networks. Validate exact query keys for each project's landing URL (`oid`/`affid` versus `offer_id`/`aff_id`).
8. Do not conflate click attribution with conversion events, reversals, or payouts. Those are separate integrations.

## Two-network flow

| Flow | Partner network | Advertiser network | Funnel handoff |
|---|---|---|---|
| Redirect with existing advertiser TID and partner TID | Reuse known partner TID if valid and proven; avoid an unnecessary partner click | SDK receives existing advertiser TID through `transaction_id` | Carry advertiser TID to next step |
| Direct link without advertiser TID | SDK generates partner TID if partner network is configured | SDK generates advertiser TID with partner TID in `sub5` | Carry newly returned advertiser TID |
| Advertiser-only direct link | No partner click | SDK generates advertiser TID | Carry advertiser TID |
| Partner click fails | Log/hold partner attribution; do not fabricate TID | Decide explicitly whether advertiser-only fallback is acceptable for project | Never substitute advertiser TID for partner TID |

**Caution:** A 32-character hexadecimal string alone does not prove a TID's network of origin. An incoming `sub5` must be checked against the redirect configuration and upstream attribution, especially if it equals `_ef_transaction_id`.

## Native cookie pattern

For each network, Everflow may write:

- `ef_tid_c_o_{offer_id}` — network offer's TID
- `ef_tid_c_a_{advertiser_id}` — network advertiser's TID

Two networks should have separate TIDs and separate relevant cookie keys. Cookie visibility across domains depends on SDK configuration, browser policies, and the actual document domain. Confirm the SDK accessor (`EF.getAdvertiserTransactionId(advertiserId)`) when available. Do not treat a missing cookie alone as proof that the redirect failed; verify the network response and conversion handoff.

## MCP reference pattern (adapt, do not copy placeholders blindly)

```html
<script src="https://ADVERTISER_DOMAIN/scripts/sdk/everflow.js"></script>
<script>
(function () {
  var p = new URLSearchParams(location.search);
  var get = function (key) { return p.get(key) || ''; };
  var advertiserDomain = 'https://ADVERTISER_DOMAIN';
  var domainMap = {
    'ADVERTISER_AFFILIATE_ID_A': 'https://PARTNER_A_DOMAIN',
    'ADVERTISER_AFFILIATE_ID_B': 'https://PARTNER_B_DOMAIN'
  };
  var advertiserAff = get('aff_id') || get('affid');
  var advertiserOffer = get('offer_id') || get('oid');
  var partnerDomain = domainMap[advertiserAff];
  var partnerOffer = get('oid2');
  var partnerAff = get('affid2');
  var existingPartnerTid = get('sub5');
  var existingAdvertiserTid = get('_ef_transaction_id');
  var validTid = function (x) { return /^[a-f0-9]{32}$/i.test(x || ''); };
  var subs = function () {
    var out = {};
    for (var i = 1; i <= 10; i++) out['sub' + i] = get('sub' + i);
    return out;
  };
  // Project-specific rule: reuse sub5 ONLY when its upstream origin is verified.
  var reusePartner = validTid(existingPartnerTid) &&
    existingPartnerTid !== existingAdvertiserTid;
  var partner = (partnerDomain && partnerOffer && partnerAff && !reusePartner)
    ? EF.click(Object.assign(subs(), {
        tracking_domain: partnerDomain,
        offer_id: partnerOffer,
        affiliate_id: partnerAff,
        uid: get('uid'), source_id: get('source_id')
      }))
    : Promise.resolve(reusePartner ? existingPartnerTid : null);

  partner.then(function (partnerTid) {
    if (!advertiserOffer || !advertiserAff) throw Error('Missing advertiser IDs');
    return EF.click(Object.assign(subs(), {
      tracking_domain: advertiserDomain,
      offer_id: advertiserOffer,
      affiliate_id: advertiserAff,
      sub5: validTid(partnerTid) ? partnerTid : get('sub5'),
      uid: get('uid'), source_id: get('source_id'),
      transaction_id: existingAdvertiserTid
    }));
  }).then(function (advertiserTid) {
    if (!validTid(advertiserTid)) throw Error('Missing advertiser TID');
    document.querySelectorAll('[data-everflow-next-step]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      var u = new URL(href, location.href);
      u.searchParams.set('_ef_transaction_id', advertiserTid);
      u.searchParams.set('c1', advertiserTid); // only where Checkout Champ uses c1
      a.href = u.toString();
    });
  }).catch(function (e) { console.error('[EF Direct Link]', e); });
})();
</script>
```

**Reference implementation, not production drop-in.** Confirm partner ID mapping, verified `sub5` origin, the actual SDK URL/version, CTA selector, and whether `EF.click({transaction_id})` creates a counted click. `Object.assign` requires modern browsers. The example deliberately does not write cookies.

## Funnel / CTA handoff

Do not assume Everflow's sample `.selt-btn` exists. Inspect actual CTAs and update their destinations using `new URL(...)` and `searchParams.set(...)`, not string concatenation. On MorePumps, landing CTA selectors were `.hs-cta-btn` and `.hs-startnow-btn`, leading to `start.morepumps.com`. Preserve `_ef_transaction_id` as the advertiser TID; pass `c1` only when downstream integration requires it. Verify every CTA after async click completion and before navigation. Handle late-rendered CTAs explicitly if applicable.

## SPA conversion-event integration

Conversion events must be implemented separately from the click pixel. For a Next.js SPA, route changes can call the same handler repeatedly. Claim a dedupe key **before** the async `EF.conversion()` request (for example `sessionStorage` keyed by event ID + advertiser TID). Mark `pending`, then `sent` or `reconcile` after the result; do not blindly retry uncertain delivery. Guard against duplicate script initialization. Do not automatically fire an email-dependent registration event without reviewing whether email is required. Prioritize current advertiser TID from URL, then SDK accessor, then appropriate native advertiser cookies. Never use upstream TID for advertiser conversion.

### MorePumps example event mapping (project-specific)

| Path | Advertiser event ID | Description |
|---|---:|---|
| `/pre-survey` | 4 | Start Pre Survey |
| `/register/complete` | 5 | Registration (capture email) |
| `/survey` | 3 | Start Intake |
| `/dosage-plan` | 8 | Add To Cart |

The original Event 4 implementation emitted three requests because it set its dedupe key only after the network response, allowing concurrent SPA callbacks to race. The corrected approach sets `pending` first. This is browser-session dedupe, not server-side exactly-once delivery.

## MorePumps worked example (do not reuse IDs blindly)

- Advertiser tracking domain: `www.wbc8ni5pua.com`; Offer **4**, Advertiser **1**.
- Upstream domain in verified test: `www.dp9mgd4trk.com`; upstream Offer **63**, Affiliate **2**, upstream advertiser cookie ID **38**.
- Advertiser-side affiliate **22** mapped to `dp9mgd4trk.com` in the tested configuration.
- Native advertiser cookies: `ef_tid_c_o_4`, `ef_tid_c_a_1`.
- Native upstream cookies: `ef_tid_c_o_63`, `ef_tid_c_a_38`.
- Landing CTA selectors: `.hs-cta-btn`, `.hs-startnow-btn` → `start.morepumps.com`.
- Checkout Champ handoff: advertiser TID in `c1`; Checkout Champ `affId` was `0D7479FB` in this project.
- Other upstream network previously used: `www.ula33noc.com`; mapping requires verification before reuse.

## Validation checklist

1. **Clean isolated browser sessions:** never compare cookies from two tracking links opened in the same browser context.
2. **Redirect:** record the original landing URL before any history modification. Confirm incoming advertiser `_ef_transaction_id`, upstream `sub5`, and their source/network ownership.
3. **Direct link:** confirm appropriate partner `/sdk/click` returns nonempty TID, then advertiser `/sdk/click` returns distinct advertiser TID.
4. **SDK cookies:** inspect all `ef_tid_c_*` cookies and compare each with its network's actual response; inspect advertiser SDK accessor.
5. **Duplicate clicks:** inspect all advertiser `/sdk/click` requests and their response, then validate counted clicks in Everflow reporting. A request alone does not prove a duplicate counted click.
6. **CTA handoff:** inspect actual button selectors and destination URL, verifying `_ef_transaction_id` and Checkout Champ `c1` contain advertiser TID.
7. **Conversion events:** verify one request per intended event/TID, event ID, email when required, and same advertiser TID across landing → registration → checkout.
8. **Negative tests:** missing upstream domain, invalid partner offer, empty TID response, duplicate SPA route changes, stale browser cookies, slow SDK response, and link opened in a new tab.
9. **Rollback:** keep last known-good pixel and event script; change only one tracking layer at a time.

## Anti-patterns / lessons learned

- Do not treat `_ef_transaction_id` and `sub5` as interchangeable.
- Do not write `ef_tid_c_*` cookies manually to mask a missing SDK click.
- Do not add custom `mp_*` TID cookies when native SDK persistence and URL handoff suffice.
- Do not fire all upstream networks as a fallback when partner identity is unknown.
- Do not infer a pixel fired solely because its `<script>` tag is present.
- Do not assume `.selt-btn` exists; inspect the real CTA DOM.
- Do not set conversion-event dedupe state only after an asynchronous success.
- Do not assume an SDK request with `transaction_id` is or is not a counted duplicate without verifying Everflow reporting.
- Do not change live Checkout Champ postbacks, Dosable relays, or reversal handling while testing click-side changes.

## Adoption instructions for other projects

Copy this standard into the project's knowledge or repository under `docs/integrations/everflow-direct-linking.md`. Supply a project configuration sheet containing advertiser tracking domain, advertiser ID, offer ID, affiliate ID, upstream partner mapping, URL parameter aliases, CTA selectors, destination domains, conversion event map, and downstream platform requirements. Validate on staging with a real redirect and a real direct link before production.

**Verification status:** MorePumps demonstrated separate native upstream and advertiser cookies, successful CTA advertiser-TID handoff, and duplicate Event 4 request diagnosis. The final MCP-based click behavior's impact on Everflow counted-click reporting and full downstream purchase attribution were not independently established in this conversation. Treat those as release gates, not completed certifications.