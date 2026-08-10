-- TKID Prospective Journey Evidence v1. Service-only, Organization-bound,
-- synthetic/local until a separate production funnel activation is approved.
create table public.tkid_sources (
  id uuid primary key default gen_random_uuid(), account_id uuid not null, organization_id uuid not null,
  business_context_id text not null, public_source_id text not null, environment text not null default 'sandbox',
  status text not null default 'disabled', allowed_origins text[] not null default '{}', schema_version integer not null default 1,
  capture_mode text not null default 'essential', rate_limit_per_minute integer not null default 120,
  retention_policy_id text not null default 'tkid-v1-review-required', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key(organization_id,business_context_id) references public.tracekit_business_contexts(organization_id,id),
  unique(organization_id,id), unique(public_source_id),
  check(public_source_id ~ '^tksrc_[A-Za-z0-9_-]{16,96}$'), check(environment in('sandbox','staging','production')),
  check(status in('disabled','active','revoked')), check(capture_mode in('essential','analytics_allowed')),
  check(schema_version=1 and rate_limit_per_minute between 1 and 10000),
  check(array_length(allowed_origins,1) is not null and array_length(allowed_origins,1)<=20)
);

create table public.tkid_journeys (
  id uuid primary key, account_id uuid not null, organization_id uuid not null, business_context_id text not null,
  source_id uuid not null, started_at timestamptz not null, ended_at timestamptz, expires_at timestamptz not null,
  state text not null default 'active', completeness text not null default 'partial', privacy_mode text not null,
  source_version text not null, normalizer_version text not null, erased_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key(organization_id,business_context_id) references public.tracekit_business_contexts(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id), unique(organization_id,id),
  check(expires_at>started_at and (ended_at is null or ended_at>=started_at)), check(state in('active','completed','expired','erased')),
  check(completeness in('complete','partial','broken_handoff','missing_checkout','missing_confirmation','unlinked_commerce','erased')),
  check(privacy_mode in('essential','analytics_allowed'))
);

create table public.tkid_browser_sessions (
  id uuid primary key, organization_id uuid not null, journey_id uuid not null, source_id uuid not null,
  started_at timestamptz not null, last_seen_at timestamptz not null, expires_at timestamptz not null,
  device_class text, browser_family text, os_family text, created_at timestamptz not null default now(),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id), unique(organization_id,id),
  check(expires_at>started_at and last_seen_at>=started_at), check(device_class is null or device_class in('desktop','mobile','tablet','other'))
);

create table public.tkid_checkout_sessions (
  id uuid primary key, organization_id uuid not null, journey_id uuid not null, browser_session_id uuid not null,
  source_id uuid not null, started_at timestamptz not null, server_confirmed_at timestamptz, state text not null default 'started', created_at timestamptz not null default now(),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,browser_session_id) references public.tkid_browser_sessions(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id), unique(organization_id,id),
  check(state in('started','submitted','server_confirmed','abandoned'))
);

create table public.tkid_event_evidence (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, source_id uuid not null, event_id uuid not null,
  evidence_hash text not null, schema_version integer not null, bounded_payload jsonb not null, received_at timestamptz not null default now(), erased_at timestamptz,
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id), unique(organization_id,event_id), unique(organization_id,id),
  check(evidence_hash ~ '^[a-f0-9]{64}$'), check(schema_version=1), check(jsonb_typeof(bounded_payload)='object'),
  check(public.financial_reconciliation_metadata_is_safe(bounded_payload))
);

create table public.tkid_events (
  id uuid primary key, organization_id uuid not null, journey_id uuid not null, browser_session_id uuid not null,
  checkout_session_id uuid, source_id uuid not null, evidence_id uuid not null, event_name text not null,
  schema_version integer not null, normalizer_version text not null, occurred_at timestamptz not null, received_at timestamptz not null,
  funnel_step_id text, offer_id text, offer_version_id text, cta_id text, cta_version text,
  price_amount numeric(18,6), currency text, billing_cadence text, recurring boolean, trial_state text,
  terms_version text, disclosure_version text, affirmative_action boolean, displayed_descriptor text, descriptor_version text,
  milestone text, duration_bucket text, action_type text, error_code text, error_category text, app_version text,
  page_id text, evidence_state text not null default 'observed', privacy_mode text not null, created_at timestamptz not null default now(),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,browser_session_id) references public.tkid_browser_sessions(organization_id,id),
  foreign key(organization_id,checkout_session_id) references public.tkid_checkout_sessions(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key(organization_id,evidence_id) references public.tkid_event_evidence(organization_id,id), unique(organization_id,id),
  check(event_name in('journey_started','page_viewed','funnel_step_viewed','offer_viewed','upsell_viewed','cta_clicked','offer_accepted','offer_declined','checkout_started','checkout_submitted','purchase_confirmed','confirmation_viewed','receipt_observed','cross_domain_handoff','client_error','vsl_milestone')),
  check(schema_version=1), check(evidence_state in('observed','derived','propagated','missing')), check(privacy_mode in('essential','analytics_allowed')),
  check(currency is null or currency ~ '^[A-Z]{3}$'), check(price_amount is null or price_amount>=0),
  check(length(coalesce(displayed_descriptor,''))<=96 and length(coalesce(error_code,''))<=64)
);
create index tkid_events_journey_time_idx on public.tkid_events(organization_id,journey_id,occurred_at,id);

create table public.tkid_commerce_links (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, journey_id uuid not null, checkout_session_id uuid not null,
  canonical_order_id uuid, provider_connection_id uuid, provider_order_reference text, charge_reference text not null,
  parent_charge_reference text, sequence_position integer not null, relationship text not null, provenance text not null default 'tkid_direct',
  linked_at timestamptz not null default now(), linked_by text not null default 'server_checkout',
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,checkout_session_id) references public.tkid_checkout_sessions(organization_id,id),
  foreign key(organization_id,canonical_order_id) references public.platform_orders(organization_id,canonical_order_id),
  foreign key(organization_id,provider_connection_id) references public.commerce_provider_connections(organization_id,id),
  unique(organization_id,charge_reference), unique(organization_id,id),
  check(sequence_position>=0), check(relationship in('main','child','upsell')), check(provenance in('tkid_direct','provider_only','unattributed')),
  check(linked_by='server_checkout')
);

create table public.tkid_handoffs (
  id uuid primary key, organization_id uuid not null, source_id uuid not null, journey_id uuid not null,
  browser_session_id uuid not null, issued_origin text not null, target_origin text not null, issued_at timestamptz not null,
  expires_at timestamptz not null, consumed_at timestamptz, token_digest text not null,
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,browser_session_id) references public.tkid_browser_sessions(organization_id,id),
  unique(organization_id,id), unique(token_digest), check(expires_at>issued_at), check(token_digest ~ '^[a-f0-9]{64}$')
);

do $$ declare t text; begin foreach t in array array['tkid_sources','tkid_journeys','tkid_browser_sessions','tkid_checkout_sessions','tkid_event_evidence','tkid_events','tkid_commerce_links','tkid_handoffs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop; end $$;

comment on table public.tkid_event_evidence is 'Private immutable bounded TKID v1 event Evidence; service-only and never a browser read model.';
comment on table public.tkid_commerce_links is 'Server-authoritative prospective Journey-to-Commerce linkage; browser claims cannot create links.';
