-- Synthetic only. Original uniqueness authority remains enabled.
CREATE TABLE platform_orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 platform text NOT NULL, platform_order_id text NOT NULL,
 provider_order_id text NOT NULL, account_id uuid NOT NULL,
 organization_id uuid NOT NULL, connection_id uuid NOT NULL,
 provider_account_id uuid NOT NULL, canonical_order_id uuid NOT NULL,
 evidence_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 amount numeric(20,6) NOT NULL
);
CREATE UNIQUE INDEX platform_orders_uq ON platform_orders(platform,platform_order_id);
CREATE UNIQUE INDEX platform_orders_platform_order_id_key ON platform_orders(platform_order_id);
CREATE TABLE payment_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 platform text NOT NULL, account_id uuid NOT NULL,
 transaction_id text NOT NULL, event_type text NOT NULL,
 external_record_id text NOT NULL,
 organization_id uuid NOT NULL, connection_id uuid NOT NULL,
 provider_account_id uuid NOT NULL, amount numeric(20,6) NOT NULL,
 fee_amount numeric(20,6), net_amount numeric(20,6),
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
CREATE ROLE web_anon NOLOGIN;
GRANT USAGE ON SCHEMA public TO web_anon;
GRANT SELECT,UPDATE ON platform_orders,payment_transactions TO web_anon;
