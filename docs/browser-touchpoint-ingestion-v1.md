# Browser Touchpoint Ingestion v1

Browser events enter TraceKit through `POST /v1/event`. The endpoint stores the raw event first in `public.browser_events_raw`, then queues bounded normalization into the existing Identity, Journey, and Attribution pipeline.

`public.browser_events_raw` is the canonical Browser Touchpoint Ingestion v1 raw ledger. The older `public.events_raw` table is legacy intake/archive data and is not used by new browser ingestion.

## Endpoint

`POST /v1/event`

Headers:

```http
content-type: application/json
x-tracekit-write-key: tk_pub_...
```

Body:

```json
{
  "workspace_id": "default",
  "event_type": "page_view",
  "event_time": "2026-07-22T10:00:00.000Z",
  "event_id": "evt_123",
  "tkid": "tkid_abc",
  "session_id": "tks_abc",
  "page_url": "https://example.com/?utm_source=partner",
  "utm_source": "partner",
  "utm_medium": "affiliate"
}
```

Response:

```json
{
  "ok": true,
  "event_id": "evt_123",
  "status": "accepted",
  "normalization_queued": true
}
```

Accepted event types are `page_view`, `click`, `identify`, `lead`, `checkout_started`, `purchase`, and `custom`. Aliases are normalized safely: `pageview` and `page.view` become `page_view`, `outbound_click` becomes `click`, `form_submit` becomes `lead`, and `initiate_checkout` becomes `checkout_started`.

`identify` remains `identify` in `journey_events`, invokes Identity resolution when email or phone evidence exists, and can link prior anonymous browser events that share the same `tkid`. It is retained as an identity milestone, not an attribution touchpoint.

Browser `purchase` is supported for smoke testing the browser -> identity -> journey -> attribution loop. It normalizes directly to `journey_events.purchase`, can use browser identity evidence when present, and can carry `amount`, `currency`, and `transaction_id`. It does not create `platform_orders`, conversion ledger rows, or Profit Engine rollups. Production commercial purchases are expected to enter through commerce and payment connectors such as Shopify, Konnektive/CheckoutChamp, WowSuite, and PayPal.

## JavaScript Install

```html
<script src="https://cdn.tracekit.io/v1/tracekit.js"></script>
<script>
  TraceKit.init({
    workspaceId: "default",
    writeKey: "tk_pub_...",
    endpoint: "https://tracekit-api.anthony-d15.workers.dev"
  });
</script>
```

The core SDK does not hard-code the production host. Set `endpoint` to the deployed Worker URL for the workspace.

## Raw Ledger

The v1 browser path is:

Browser SDK / `POST /v1/event`
-> `public.browser_events_raw`
-> Connector Runtime `browser_event_normalize_batch`
-> `public.journey_events`
-> Journey Engine
-> Attribution
-> Attribution Ledger

`browser_events_raw.session_id` is `text`, so SDK session IDs such as `tks_smoke_001` are valid. Replay idempotency is enforced by `(workspace_id, event_id)`.

## GTM Custom HTML

```html
<script>
  (function () {
    var s = document.createElement("script");
    s.src = "https://cdn.tracekit.io/v1/tracekit.js";
    s.onload = function () {
      TraceKit.init({
        workspaceId: "{{TraceKit Workspace ID}}",
        writeKey: "{{TraceKit Public Write Key}}",
        endpoint: "{{TraceKit API Endpoint}}",
        autoOutboundClicks: true
      });
    };
    document.head.appendChild(s);
  }());
</script>
```

## Manual Events

```js
TraceKit.track("click", {
  click_id: "hero_cta",
  utm_source: "partner",
  affiliate_id: "aff_123"
});

TraceKit.identify({
  email: "customer@example.com",
  phone: "+15551112222"
});

TraceKit.track("checkout_started", {
  offer_id: "offer_123",
  transaction_id: "click_or_network_id"
});

TraceKit.track("purchase", {
  amount: "49.95",
  currency: "USD",
  transaction_id: "smoke_purchase_001"
});
```

## Parameter Mapping

TraceKit captures current event parameters and first-touch session parameters separately.

Canonical mappings:

| Input | Canonical field |
| --- | --- |
| `utm_source` | `source` / metadata |
| `utm_medium` | `medium` / metadata |
| `utm_campaign` | `campaign_id` / metadata |
| `affiliate_id`, `affid`, `aff_id` | `affiliate_id` |
| `offer_id`, `oid` | `offer_id` |
| `_ef_transaction_id`, `ef_transaction_id`, `transaction_id` | `transaction_id` |
| `c1`, `sub1` through `sub10` | `sub1` through `sub10` |
| `gclid`, `fbclid`, `ttclid`, `msclkid`, `irclickid`, `click_id` | metadata ad click IDs |

TraceKit preserves original parameter names in metadata. `_ef_transaction_id` is normalized into canonical `transaction_id`, but TraceKit does not assume it is Everflow unless source context says so.

## Consent

Pass consent state as a structured `consent` object. Ingestion stores the raw event and includes the consent object in normalized journey metadata. The SDK does not bypass site consent logic; initialize or track only when your consent policy allows.

## Diagnostics

Structured logs include accepted events, duplicates, raw persistence, normalization queueing, normalization completion, person resolution counts, anonymous retention, journey assignment, and attribution recalculation attempts. Logs avoid raw email, phone, IP address, and full URLs with query strings.

## Troubleshooting

- `invalid_write_key`: verify the workspace public write key.
- `origin_not_allowed`: add the site origin to `browser_event_sources.allowed_origins`.
- `event_id_conflict`: the same `workspace_id + event_id` arrived with a different payload.
- `normalization_queued=false`: check the `wowboost_imports` queue binding and Connector Runtime health.
- Events with no email or phone stay anonymous and are retained by `tkid`/`session_id`.

## Test Event

```bash
curl -X POST "$TRACEKIT_API/v1/event" \
  -H "content-type: application/json" \
  -H "x-tracekit-write-key: $TRACEKIT_PUBLIC_WRITE_KEY" \
  -d '{
    "workspace_id": "default",
    "event_type": "page_view",
    "event_time": "2026-07-22T10:00:00.000Z",
    "event_id": "test-event-001",
    "tkid": "tkid_test",
    "session_id": "tks_test",
    "page_url": "https://example.com/?utm_source=test"
  }'
```

Smoke-test payload for the production repair:

```bash
curl -X POST "https://tracekit-api.anthony-d15.workers.dev/v1/event" \
  -H "content-type: application/json" \
  -H "x-tracekit-write-key: $TRACEKIT_PUBLIC_WRITE_KEY" \
  -d '{
    "workspace_id": "default",
    "event_type": "page_view",
    "event_time": "2026-07-23T05:20:00.000Z",
    "event_id": "smoke-pageview-001",
    "tkid": "tkid_smoke_001",
    "session_id": "tks_smoke_001",
    "page_url": "https://tracekit.io/smoke-test?utm_source=facebook&utm_medium=cpc&utm_campaign=browser-smoke-test",
    "landing_url": "https://tracekit.io/smoke-test",
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "browser-smoke-test",
    "affiliate_id": "123"
  }'
```

Admin setup and health:

- `POST /v1/event/setup` generates or stores a public write key and allowed origins.
- `GET /v1/event/setup?workspace_id=default` returns wizard-safe status, install snippet, last received event, last normalized event, and parameter summary.

## Migration 021/023 Rollout

1. Apply `supabase/migrations/021_browser_events_raw.sql`.
2. Apply `supabase/migrations/023_browser_purchase_smoke_event.sql` if browser purchase smoke tests are needed.
3. Verify `public.browser_events_raw` columns, indexes, and event type constraints.
4. Deploy the Worker.
5. Reuse or rotate the current browser public write key.
6. Send the smoke-test `page_view`.
7. Verify `browser_events_raw`.
8. Verify normalization status.
9. Verify `journey_events`.
10. Verify queue/runtime diagnostics.
11. Rotate the write key before installing on a real client site if the current key was exposed during testing.

Verification SQL:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'browser_events_raw'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'browser_events_raw'
order by indexname;

select event_id, workspace_id, session_id, normalization_status, source, received_at
from public.browser_events_raw
where workspace_id = 'default'
  and event_id = 'smoke-pageview-001';

select id, event_type, source_platform, source_connector, source_record_id, metadata->>'tkid' as tkid
from public.journey_events
where workspace_id = 'default'
  and source_platform = 'browser'
  and source_connector = 'browser-event-normalization'
  and source_record_id = 'smoke-pageview-001';
```

## Optional Legacy Bridge

Migration 021 creates `public.copy_legacy_events_raw_to_browser_events_raw(p_limit integer)`, but does not invoke it. It is an explicit bridge for eligible legacy rows only:

- deterministic event IDs from migration 020, such as `legacy_<old_id>`
- original payload and timestamps preserved
- legacy `session_id` cast to text
- `source = legacy_events_raw`
- `ON CONFLICT (workspace_id, event_id) DO NOTHING`

Run it manually only after deciding which legacy events should enter Browser Touchpoint v1:

```sql
select public.copy_legacy_events_raw_to_browser_events_raw(1000);
```

## Rollback Considerations

If the Worker deploy needs to be rolled back, leave `public.browser_events_raw` in place. The table is additive and can safely retain received raw events while runtime issues are corrected. Do not copy those events back into `public.events_raw`.

## Key Rotation

Browser write keys are public ingestion keys. If a key was exposed in curl tests, rotate it with `POST /v1/event/setup` before installing the SDK on a real client site.
