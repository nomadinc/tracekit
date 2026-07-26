# TraceKit Attribution Engine

Status: foundational architecture specification.

## Core Question

Where did this customer come from?

TraceKit must answer:

- Which affiliate touched the customer first?
- Which campaign touched them first?
- Which source introduced them?
- What was the last touch before conversion?
- What paid, organic, affiliate, direct, email, or referral touches occurred
  between first touch and conversion?
- Which touch influenced the base order, upsell, rebill, or later purchase?
- Which touch or attribution model produced actual profit?

TraceKit is not a Hyros clone.

TraceKit combines attribution evidence with identity, commerce, payments, ledger
events, and profit.

The Attribution Identity is one of the two canonical identity anchors used
throughout TraceKit.

## Immutable Activity Model

Every touchpoint must be stored as an immutable event.

TraceKit must never store only first touch and last touch. It must store every
observed touch and derive attribution models later.

```mermaid
flowchart LR
  Touches["Immutable Touchpoints"] --> Models["Attribution Models"]
  Identity["Identity Evidence"] --> Models
  Orders["Commerce Orders"] --> Models
  Ledger["Ledger Events"] --> Profit["Profit"]
  Profit --> Models
  Models --> Outputs["Attribution Outputs"]
```

## Canonical Attribution Event Fields

### Identity

| Field |
| --- |
| workspace_id |
| touchpoint_id |
| tkid |
| identity_id |
| visitor_id |
| device_id |
| session_id |
| journey_id |

### Event

| Field | Notes |
| --- | --- |
| occurred_at | Source event timestamp. |
| event_type | Canonical event type. |
| event_name | Source or user-facing event name. |
| event_source | Source system or service. |
| ingestion_method | API import, webhook, browser tracking, server event, or manual import. |

### Page / URL

| Field |
| --- |
| page_url |
| page_path |
| landing_page_url |
| referrer_url |
| referrer_domain |
| destination_url |
| outbound_url |

### Raw URL Evidence

| Field | Notes |
| --- | --- |
| raw_query_string | Original query string exactly as observed when possible. |
| raw_url_params JSON | All parsed URL parameters, including unknown parameters. |
| raw_fragment | URL fragment. |
| original_url | Original observed URL. |

### Normalized Marketing Parameters

| Field |
| --- |
| utm_source |
| utm_medium |
| utm_campaign |
| utm_term |
| utm_content |
| utm_id |

### Affiliate

| Field |
| --- |
| affiliate_id |
| offer_id |
| campaign_id |
| source_id |
| uid |
| sub1 through sub10 |
| affiliate_transaction_id |
| Everflow transaction ID |

### Advertising Click IDs

TraceKit must preserve known and future click IDs:

| Field |
| --- |
| gclid |
| gbraid |
| wbraid |
| dclid |
| fbclid |
| ttclid |
| msclkid |
| sccid |
| li_fat_id |
| any future or unknown click ID |

### Creative Context

| Field |
| --- |
| ad_id |
| adset_id |
| campaign_id |
| creative_id |
| placement |
| keyword |
| publisher |
| network |

### Technical Context

| Field |
| --- |
| user_agent |
| browser |
| device_type |
| operating_system |
| IP-derived country/region when legally permitted |
| first-party cookie identifiers |

## Critical URL Parameter Rule

TraceKit must record every URL parameter present at every touchpoint.

Known parameters should be normalized into first-class fields.

Unknown parameters must remain preserved in raw_url_params so future parsers and
attribution rules can use them.

Do not discard unknown parameters.

## Events To Capture

TraceKit should capture these event types when supported by a connector,
tracking library, webhook, or server-side integration:

| Event |
| --- |
| page view |
| landing |
| SPA route change |
| referral |
| ad click arrival |
| affiliate click arrival |
| CTA click |
| outbound click |
| form start |
| form submission |
| lead created |
| quiz start |
| quiz completion |
| checkout start |
| purchase |
| upsell |
| downsell |
| subscription |
| rebill |
| identity capture |
| identity merge |
| offline conversion |

## Attribution Outputs

Attribution services should produce these outputs from immutable touchpoint
facts:

| Output |
| --- |
| original first touch |
| last touch |
| first paid touch |
| last paid touch |
| first affiliate touch |
| last affiliate touch |
| first campaign touch |
| last campaign touch |
| touch immediately before lead |
| touch immediately before base order |
| touch immediately before upsell |
| touch immediately before rebill |
| complete touch sequence |
| session count before conversion |
| time from first touch to conversion |

## Attribution Models

Supported and future attribution models should be derived from facts, not stored
as replacements for facts:

| Model |
| --- |
| First Touch |
| Last Touch |
| First Paid Touch |
| Last Paid Touch |
| First Affiliate Touch |
| Last Affiliate Touch |
| Linear |
| Position Based |
| Time Decay |
| Custom Rule-Based |
| Profit-Weighted Attribution |

## Attribution Facts Versus Conclusions

| Observed Facts | Derived Conclusions |
| --- | --- |
| URL | Attributed source |
| Timestamp | Model credit |
| Referrer | First-touch designation |
| Query parameters | Last-touch designation |
| Click ID | Assisted conversion |
| Page/event | Attributed revenue |
| Raw source payload | Attributed profit |

Never overwrite facts when a model changes.

Attribution conclusions must be recalculable from preserved touchpoints,
identity evidence, commerce records, ledger events, and profit outputs.

## Attribution Integrity Rules

1. Original first touch is immutable.
2. Every observed touch is retained.
3. Direct traffic does not erase prior attribution.
4. Attribution windows are configurable.
5. Identity merges retain all pre-merge touch history.
6. Cross-device matching includes confidence and evidence.
7. Every attributed conversion can be traced to the touches used.
8. Attribution calculations must be reproducible.
9. URL parameters are stored at every touch.
10. Revenue attribution and profit attribution must be separately available.

## Attribution Engine v1 Implementation

Sprint 2B adds a deterministic, rebuildable attribution engine on top of:

```text
people
journeys
journey_events
```

Attribution results are derived data. They are not authoritative for orders,
identities, ledger events, or profit.

### Stored Credits

Migration `019_attribution_engine_v1.sql` creates
`journey_attribution_credits`.

Each row stores:

- workspace, person, journey, conversion event, and optional touchpoint event
- model and model version
- touchpoint eligibility version
- credit fraction, percent, amount, and currency
- normalized touchpoint dimensions
- status and reason for unattributed conversions
- calculation metadata and timestamps

The initial models are:

- `first_touch`
- `last_touch`

Credits are unique by:

```text
workspace_id
conversion_event_id
model
model_version
touchpoint_event_id
```

Unattributed conversions are stored with `touchpoint_event_id = null` and a
separate uniqueness rule for the same conversion, model, and version.

### Eligibility

Touchpoint eligibility is centralized in application code.

Eligible candidate event types are:

- `click`
- `email_click`
- `landing_page`
- `session_start`
- `page_view`
- `sms`
- `call`
- `custom`

A candidate must also include acquisition context, such as:

- `affiliate_id`
- `campaign_id`
- `source`
- `medium`
- `offer_id`
- `touchpoint_id`
- `transaction_id`

Conversion eligibility is also centralized. The initial attributable conversion
types are:

- `purchase`
- `upsell`
- `subscription_started`
- `subscription_renewed`

Refunds, chargebacks, and cancellations remain part of the journey timeline but
do not receive positive acquisition credit in v1.

### Window Rules

The default v1 attribution window is:

- 30 days for clicks and most acquisition events
- 7 days for email clicks
- 7 days for SMS
- 30 days for calls
- 1 day for landing pages, session starts, and page views

Journey-specific `attribution_window_config` can override these values using:

```json
{
  "default_click_days": 30,
  "default_view_days": 1,
  "channels": {
    "email": { "click_days": 7 },
    "affiliate": { "click_days": 30 }
  }
}
```

Boundary equality is inclusive. A touchpoint is eligible when:

```text
conversion_time - touchpoint_time <= resolved_window
```

### First Touch And Last Touch

Both models operate only within the same workspace, journey, and person.

First Touch selects the earliest eligible touchpoint at or before the
conversion:

```text
event_time ASC, event_id ASC
```

Last Touch selects the latest eligible touchpoint at or before the conversion:

```text
event_time DESC, event_id DESC
```

Each successful v1 result awards:

```text
credit_fraction = 1.000000
credit_percent = 100.0000
```

If the conversion amount is missing, the credit percentage is still populated
and `credit_amount` remains null.

### Backfill And APIs

`POST /v1/attribution/backfill` processes one bounded batch of journeys using a
stable keyset cursor based on:

```text
started_at
id
```

The backfill stores progress in `integration_import_jobs` and is safe to rerun.

Read APIs:

- `GET /v1/journeys/:journey_id/attribution`
- `GET /v1/persons/:person_id/attribution`

Recalculation API:

- `POST /v1/journeys/:journey_id/attribution/recalculate`

Recalculation replaces only derived attribution credits for the requested
conversion/model/version groups. Source journey events and journey assignments
are never mutated.

## Tracking Implementation Roadmap

### Browser

Future-state browser tracking should support:

- First-party JS tracking library
- First-party cookies/local storage
- SPA route observation
- URL/referrer capture
- Form and CTA events
- Outbound URL enrichment
- Identity capture

### Server

Future-state server-side tracking should support:

- Server-side events
- Webhook events
- Order/payment lifecycle
- Offline conversions
- Redirect tracking
- Durable click/order mappings

### Privacy And Governance

Attribution collection and use must account for:

- Workspace configuration
- Retention controls
- Consent-aware collection
- PII separation
- Hashing where appropriate
- Least-privilege access
- Complete auditability

## Closing Principle

Attribution tells TraceKit where the customer came from and every meaningful
marketing touch that influenced the outcome.
