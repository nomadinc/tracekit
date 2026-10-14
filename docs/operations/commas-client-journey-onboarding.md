# Commas onboarding for customer journey continuity

Status: review recipe. This defines client setup and acceptance requirements; it does not certify Commas metadata persistence or dispute linkage for a new client. Accufy's existing offers, links and checkout are fixed and must not be changed. WS-022 retains release authority.

## Required tracking handoff

Pass an actual TraceKit-issued TKID as `tkid` and retain it through landing-page redirects, checkout and optional purchases. If TraceKit issues the TKID on the landing page, add it to the checkout handoff there. Do not replace it with the Everflow click ID, invent an Everflow TKID macro or create a new TKID for each funnel page.

Keep the Everflow click ID separately, with affiliate/offer IDs and applicable sub1–sub10 values. Preserve missing attribution as missing, including direct traffic. Reject conflicting click-ID aliases rather than silently selecting one.

Example destination template, with placeholders resolved by their respective integrations:

```text
https://landing.example/m1/?_ef_transaction_id=<EVERFLOW_CLICK_ID>&affid=<AFFILIATE_ID>&oid=<OFFER_ID>&sub1=<SUB1>&tkid=<TRACEKIT_TKID>
```

Never put customer email, phone, credentials or payment details in tracking URLs.

## Persistence requirement

The checkout integration must capture the tracking fields, retain them in its server-side checkout/session context and write them to provider-supported order metadata or custom fields. Session storage alone is not durable provider persistence. An embedded checkout that rebuilds a metadata allowlist must explicitly include the retained fields.

Preserve the originating TKID and acquisition references on upsells while keeping each purchase's own provider identity. Subscriptions and rebills must retain their provider parent relationships. A funnel session identifier may be retained alongside TKID; it must not be labeled TKID without a verified TraceKit mapping.

The existing TraceKit Commas purchase normalizer reads `tkid`, `affid`, `sub1`, `sub4` and click aliases from purchase-webhook `additional_params`. Other parameter keys are retained as restricted key diagnostics, not all normalized attribution values. Supporting arbitrary sub1–sub10 in the client handoff does not mean TraceKit currently projects every sub-ID. Confirm the provider's metadata-to-additional_params behavior with evidence before publishing platform-specific copy-and-paste instructions.

## Connector setup

Bind the correct seller organization and environment to one scoped TraceKit provider account. Configure supported purchase, subscription, refund-created and dispute-created/updated deliveries to the connector's governed webhook endpoint. Use the connector's actual capability contract, signature verification and server-side credential handling. Do not assume every event shares the same payload schema or subscription setup.

## Acceptance evidence

| Relationship | Required proof |
| --- | --- |
| Landing to checkout | The same actual TKID and attribution values survive the handoff |
| Checkout to purchase | Retained provider API/webhook evidence contains the values and the provider purchase/order identity |
| Purchase to customer journey | Scoped canonical order/customer mapping and the intended TKID journey are established |
| Refund to purchase | Explicit original payment/order reference resolves to the exact original scoped order |
| Dispute to purchase | Explicit provider transaction/order reference, or a provider-proven payment-intent/charge-to-order bridge |
| Upsell/subscription/rebill | Distinct source events retain their parent relationship and acquisition context |
| Amount reporting | Principal and fee currencies are independently source-backed or null; actual wallet loss/recovery has separate evidence |

Use existing read-only evidence first. Any sandbox purchase/refund or dispute fixture must use a separately verified sandbox configuration and authorized controlled test. Do not create real chargebacks to test linkage. Unknown links remain unresolved and ingestible; customer/email/amount/time similarity does not establish exact authority.

Certify each relationship separately. TKID persistence can pass while dispute linkage remains unavailable. Do not label the full order/refund/dispute journey supported until every required relationship passes.

## Accufy audit checkpoint

Read-only production assessment on 2026-10-14 around 05:05 UTC found 305 retained purchase observations, all linked to canonical orders and customers; 226 carried an Everflow click alias and none had normalized TKID or TKID mentioned in restricted parameter metadata. There were 538 disputes with payment-intent IDs, no other normalized parent identifiers and no exact order payment-reference matches. The 82,890 scoped order JSON records had no named payment_intent_id, tkid or additional_params field at any JSON depth. This is an as-of projection audit, not an exhaustive raw provider API capability proof.

Public funnel scripts inspected for pushmysystem.ai/m1/ and /checkout/ retain click/affiliate/offer context but omit TKID and sub-IDs from that saved context and reconstructed embedded checkout metadata. Server backend code and provider metadata persistence were not verified. No Accufy changes are authorized.

For Accufy, use retained/API evidence and authoritative relationships already available. Do not require a recurring enriched support export. Qualify the standard provider payment-reference bridge independently; unresolved disputes remain visible without invented journey linkage.

## Outstanding provider verification

Determine whether the standard Commas transaction detail or purchase webhook exposes the processor payment-intent/charge identifier seen on dispute events. Determine which supported metadata/custom-field path returns TKID in both API and webhook evidence. These are separate checks. If the standard surface genuinely lacks the dispute-to-order bridge, clients cannot solve it by adding URL parameters; document a provider capability limitation and request a durable API/webhook improvement.
