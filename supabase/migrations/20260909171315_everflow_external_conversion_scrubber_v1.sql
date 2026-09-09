-- Everflow external conversion scrubber v1.
-- All objects are connection/organization scoped and server-only. The public
-- gateway authenticates before using the service role; browsers receive no
-- direct grants to these tables.

create table public.everflow_scrubber_settings (
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  scrubbing_enabled boolean not null default true,
  global_pass_rate numeric(6,5) not null default 1,
  fail_open boolean not null default true,
  reporting_timezone text not null default 'UTC',
  daily_period_rollover boolean not null default false,
  eligible_event_keys text[] not null default array['purchase']::text[],
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, connection_id),
  constraint everflow_scrubber_settings_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id)
    on delete cascade,
  constraint everflow_scrubber_settings_rate_check check (global_pass_rate between 0 and 1),
  constraint everflow_scrubber_settings_timezone_check check (length(btrim(reporting_timezone)) between 1 and 128),
  constraint everflow_scrubber_settings_events_check check (cardinality(eligible_event_keys) > 0)
);

create table public.everflow_scrubber_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  source_key text not null,
  display_name text not null,
  token_sha256 text not null,
  active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_scrubber_sources_settings_fk
    foreign key (organization_id, connection_id)
    references public.everflow_scrubber_settings (organization_id, connection_id)
    on delete cascade,
  constraint everflow_scrubber_sources_key_check check (source_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  constraint everflow_scrubber_sources_name_check check (length(btrim(display_name)) between 1 and 128),
  constraint everflow_scrubber_sources_token_check check (token_sha256 ~ '^[0-9a-f]{64}$'),
  unique (organization_id, connection_id, source_key),
  unique (token_sha256)
);

create table public.everflow_scrubber_offer_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  network_offer_id text not null,
  pass_rate numeric(6,5) not null,
  effective_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  change_reason text,
  created_at timestamptz not null default now(),
  constraint everflow_scrubber_offer_rules_settings_fk
    foreign key (organization_id, connection_id)
    references public.everflow_scrubber_settings (organization_id, connection_id)
    on delete cascade,
  constraint everflow_scrubber_offer_rules_rate_check check (pass_rate between 0 and 1),
  constraint everflow_scrubber_offer_rules_time_check check (ended_at is null or ended_at > effective_at)
);

create unique index everflow_scrubber_offer_rules_active_uidx
  on public.everflow_scrubber_offer_rules (organization_id, connection_id, network_offer_id)
  where ended_at is null;
create index everflow_scrubber_offer_rules_history_idx
  on public.everflow_scrubber_offer_rules (organization_id, connection_id, network_offer_id, effective_at desc);

create table public.everflow_scrubber_pair_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  network_offer_id text not null,
  network_affiliate_id text not null,
  pass_rate numeric(6,5) not null,
  effective_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  change_reason text,
  created_at timestamptz not null default now(),
  constraint everflow_scrubber_pair_rules_settings_fk
    foreign key (organization_id, connection_id)
    references public.everflow_scrubber_settings (organization_id, connection_id)
    on delete cascade,
  constraint everflow_scrubber_pair_rules_rate_check check (pass_rate between 0 and 1),
  constraint everflow_scrubber_pair_rules_time_check check (ended_at is null or ended_at > effective_at)
);

create unique index everflow_scrubber_pair_rules_active_uidx
  on public.everflow_scrubber_pair_rules (organization_id, connection_id, network_offer_id, network_affiliate_id)
  where ended_at is null;
create index everflow_scrubber_pair_rules_history_idx
  on public.everflow_scrubber_pair_rules (organization_id, connection_id, network_offer_id, network_affiliate_id, effective_at desc);

create table public.everflow_scrubber_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  network_offer_id text not null,
  network_affiliate_id text not null,
  rule_source text not null,
  rule_id uuid,
  target_pass_rate numeric(6,5) not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  eligible_count bigint not null default 0,
  passed_count bigint not null default 0,
  scrubbed_count bigint not null default 0,
  eligible_revenue numeric(18,4) not null default 0,
  passed_revenue numeric(18,4) not null default 0,
  scrubbed_revenue numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_scrubber_periods_settings_fk
    foreign key (organization_id, connection_id)
    references public.everflow_scrubber_settings (organization_id, connection_id)
    on delete cascade,
  constraint everflow_scrubber_periods_source_check check (rule_source in ('pair','offer','global')),
  constraint everflow_scrubber_periods_rate_check check (target_pass_rate between 0 and 1),
  constraint everflow_scrubber_periods_counts_check check (eligible_count = passed_count + scrubbed_count),
  constraint everflow_scrubber_periods_time_check check (ended_at is null or ended_at > started_at)
);

create unique index everflow_scrubber_periods_active_uidx
  on public.everflow_scrubber_periods (organization_id, connection_id, network_offer_id, network_affiliate_id)
  where ended_at is null;
create index everflow_scrubber_periods_history_idx
  on public.everflow_scrubber_periods (organization_id, connection_id, network_offer_id, network_affiliate_id, started_at desc);

create table public.everflow_scrubber_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  source_id uuid not null,
  source_key text not null,
  idempotency_key text not null,
  transaction_id text not null,
  network_offer_id text not null,
  network_affiliate_id text not null,
  order_id text,
  event_key text not null,
  event_id text,
  adv_event_id text,
  amount numeric(18,4),
  currency text,
  user_ip inet,
  coupon_code text,
  email_sha256 text,
  received_at timestamptz not null default now(),
  decision text not null,
  decision_reason text not null,
  rule_source text,
  rule_id uuid,
  rule_period_id uuid,
  effective_pass_rate numeric(6,5),
  controller_probability numeric(8,7),
  request_payload jsonb not null,
  forwarding_payload jsonb,
  forward_status text not null default 'not_applicable',
  forward_attempt_count integer not null default 0,
  next_retry_at timestamptz,
  forwarded_at timestamptz,
  everflow_http_status integer,
  everflow_response_reference text,
  last_forward_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_scrubber_conversions_source_fk
    foreign key (source_id) references public.everflow_scrubber_sources (id),
  constraint everflow_scrubber_conversions_period_fk
    foreign key (rule_period_id) references public.everflow_scrubber_periods (id),
  constraint everflow_scrubber_conversions_decision_check check (decision in ('PASS','SCRUB')),
  constraint everflow_scrubber_conversions_reason_check check (decision_reason in ('PASS_RULE_TARGET','SCRUB_RULE_TARGET','PASS_GLOBAL_BYPASS','PASS_FAIL_OPEN','PASS_NON_ELIGIBLE_EVENT')),
  constraint everflow_scrubber_conversions_forward_check check (forward_status in ('not_applicable','pending','retry','succeeded','permanent_failure')),
  constraint everflow_scrubber_conversions_rate_check check (effective_pass_rate is null or effective_pass_rate between 0 and 1),
  constraint everflow_scrubber_conversions_probability_check check (controller_probability is null or controller_probability between 0 and 1),
  constraint everflow_scrubber_conversions_email_check check (email_sha256 is null or email_sha256 ~ '^[0-9a-f]{64}$'),
  constraint everflow_scrubber_conversions_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  unique (organization_id, connection_id, source_key, idempotency_key)
);

create index everflow_scrubber_conversions_pair_received_idx
  on public.everflow_scrubber_conversions (organization_id, connection_id, network_offer_id, network_affiliate_id, received_at desc);
create index everflow_scrubber_conversions_retry_idx
  on public.everflow_scrubber_conversions (next_retry_at)
  where forward_status in ('pending','retry');

create table public.everflow_scrubber_ingress_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  connection_id uuid,
  source_id uuid,
  conversion_id uuid,
  request_id uuid not null,
  received_at timestamptz not null default now(),
  result text not null,
  reason_code text not null,
  payload_sha256 text not null,
  validation_errors jsonb not null default '[]'::jsonb,
  constraint everflow_scrubber_attempt_source_fk foreign key (source_id) references public.everflow_scrubber_sources (id),
  constraint everflow_scrubber_attempt_conversion_fk foreign key (conversion_id) references public.everflow_scrubber_conversions (id),
  constraint everflow_scrubber_attempt_result_check check (result in ('accepted','rejected','duplicate','fail_open')),
  constraint everflow_scrubber_attempt_reason_check check (reason_code in ('ACCEPTED','REJECT_INVALID_REQUEST','REJECT_UNAUTHORIZED_REQUEST','DUPLICATE_SUPPRESSED','PASS_FAIL_OPEN')),
  constraint everflow_scrubber_attempt_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  unique (request_id)
);

create table public.everflow_scrubber_forward_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  conversion_id uuid not null,
  attempt_number integer not null,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text not null,
  http_status integer,
  response_reference text,
  error_code text,
  retry_at timestamptz,
  constraint everflow_scrubber_forward_attempt_conversion_fk
    foreign key (conversion_id) references public.everflow_scrubber_conversions (id) on delete cascade,
  constraint everflow_scrubber_forward_attempt_outcome_check check (outcome in ('started','succeeded','retryable_failure','permanent_failure')),
  unique (conversion_id, attempt_number)
);

create index everflow_scrubber_daily_reporting_idx
  on public.everflow_scrubber_conversions (organization_id, connection_id, received_at, network_offer_id, network_affiliate_id, decision);

alter table public.everflow_scrubber_settings enable row level security;
alter table public.everflow_scrubber_sources enable row level security;
alter table public.everflow_scrubber_offer_rules enable row level security;
alter table public.everflow_scrubber_pair_rules enable row level security;
alter table public.everflow_scrubber_periods enable row level security;
alter table public.everflow_scrubber_conversions enable row level security;
alter table public.everflow_scrubber_ingress_attempts enable row level security;
alter table public.everflow_scrubber_forward_attempts enable row level security;

revoke all on table public.everflow_scrubber_settings, public.everflow_scrubber_sources,
  public.everflow_scrubber_offer_rules, public.everflow_scrubber_pair_rules,
  public.everflow_scrubber_periods, public.everflow_scrubber_conversions,
  public.everflow_scrubber_ingress_attempts, public.everflow_scrubber_forward_attempts
  from anon, authenticated;
grant select, insert, update on table public.everflow_scrubber_settings, public.everflow_scrubber_sources,
  public.everflow_scrubber_offer_rules, public.everflow_scrubber_pair_rules,
  public.everflow_scrubber_periods, public.everflow_scrubber_conversions,
  public.everflow_scrubber_ingress_attempts, public.everflow_scrubber_forward_attempts
  to service_role;

comment on table public.everflow_scrubber_periods is
  'Independent Offer x Affiliate controller state. A new active period is created whenever the effective rule identity/rate changes.';
comment on column public.everflow_scrubber_sources.token_sha256 is
  'SHA-256 digest of a high-entropy source bearer token. Plaintext tokens are never persisted.';
comment on column public.everflow_scrubber_conversions.request_payload is
  'Redacted canonical audit payload. Raw secrets and plaintext email must not be stored.';
