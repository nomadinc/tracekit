-- Synthetic only. Original uniqueness authority remains enabled.
CREATE TABLE platform_orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 platform text NOT NULL, platform_order_id text NOT NULL,
 provider_order_id text NOT NULL, order_id text, workspace_id text, source_mapping_id uuid, account_id uuid NOT NULL,
 organization_id uuid NOT NULL, connection_id uuid NOT NULL,
 provider_account_id uuid NOT NULL, canonical_order_id uuid NOT NULL,
 evidence_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 amount numeric(20,6)
);
CREATE UNIQUE INDEX platform_orders_uq ON platform_orders(platform,platform_order_id);
CREATE UNIQUE INDEX platform_orders_platform_order_id_key ON platform_orders(platform_order_id);
CREATE TABLE payment_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 platform text NOT NULL, account_id uuid NOT NULL,
 transaction_id text NOT NULL, event_type text NOT NULL,
 external_record_id text NOT NULL,
 organization_id uuid, connection_id uuid, provider_account_id uuid,
 workspace_id text, parent_transaction_id text, order_id text, status text, currency text,
 payment_method text, processor text, transaction_ts timestamptz,
 transaction_event_code text, transaction_updated_at timestamptz,
 matched_platform_order_id text, raw_json jsonb,
 amount numeric(30,6),
 fee_amount numeric(30,20), net_amount numeric(30,20),
 version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX payment_transactions_platform_account_transaction_event_uidx
 ON payment_transactions(platform,account_id,transaction_id,event_type);
CREATE UNIQUE INDEX payment_transactions_external_record_idx
 ON payment_transactions(platform,account_id,external_record_id);
INSERT INTO platform_orders(platform,platform_order_id,provider_order_id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,evidence_id,amount)
VALUES ('next29','102872','102872','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae',123.450000);
INSERT INTO payment_transactions(platform,account_id,transaction_id,event_type,external_record_id,organization_id,connection_id,provider_account_id,amount,fee_amount,net_amount)
VALUES ('next29','11111111-1111-4111-8111-111111111111','2446','debit','2446-stem','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',19.990000,NULL,NULL);
-- Fixture setup is performed as fixture_admin, a disposable Postgres bootstrap role.
-- The HTTP runtime uses only postgrest_login, which is NOT a superuser or owner.
-- web_anon has scoped test-table grants but no database-enforced tenant RLS.
CREATE ROLE web_anon NOLOGIN;
CREATE ROLE postgrest_login LOGIN NOINHERIT PASSWORD 'synthetic-api-only';
GRANT web_anon TO postgrest_login;
GRANT CONNECT ON DATABASE acceptance TO postgrest_login;
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT,UPDATE ON platform_orders,payment_transactions TO web_anon;

CREATE TABLE commerce_source_mappings(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 provider_account_id uuid NOT NULL,canonical_object_id uuid NOT NULL,
 canonical_object_type text NOT NULL,source_object_type text NOT NULL,
 source_object_id text NOT NULL,payload_hash text
);
CREATE TABLE commerce_evidence_records(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,connection_id uuid NOT NULL,
 provider_account_id uuid NOT NULL,source_object_type text NOT NULL,
 source_object_id text NOT NULL,payload_hash text NOT NULL,
 storage_reference text,deleted_at timestamptz
);
CREATE TABLE commerce_refund_events(
 id uuid PRIMARY KEY,account_id uuid NOT NULL,organization_id uuid NOT NULL,
 connection_id uuid NOT NULL,provider_account_id uuid NOT NULL,
 canonical_order_id uuid NOT NULL,evidence_id uuid NOT NULL,
 source_mapping_id uuid NOT NULL,provider_refund_id text NOT NULL,
 provider_payment_id text,amount numeric(30,20),amount_gross numeric(30,20),
 currency text,occurred_at timestamptz NOT NULL,
 UNIQUE(connection_id,provider_account_id,provider_refund_id)
);
GRANT SELECT,INSERT,UPDATE ON commerce_source_mappings,commerce_evidence_records,commerce_refund_events TO web_anon;
GRANT INSERT ON platform_orders,payment_transactions TO web_anon;
GRANT USAGE,SELECT ON SEQUENCE platform_orders_id_seq TO web_anon;

-- A separate SQL acceptance login exercises native DML, concurrency and rollback.
-- It is deliberately not the synthetic fixture owner or PostgREST login.
CREATE ROLE acceptance_sql LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOINHERIT PASSWORD 'synthetic-test-only';
GRANT CONNECT ON DATABASE acceptance TO acceptance_sql;
GRANT USAGE ON SCHEMA public TO acceptance_sql;
GRANT SELECT,INSERT,UPDATE ON
  platform_orders,payment_transactions,commerce_source_mappings,
  commerce_evidence_records,commerce_refund_events TO acceptance_sql;
GRANT USAGE,SELECT ON SEQUENCE platform_orders_id_seq TO acceptance_sql;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
