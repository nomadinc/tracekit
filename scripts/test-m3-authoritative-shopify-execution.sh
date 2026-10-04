#!/usr/bin/env bash
set -euo pipefail

database_url="${TRACEKIT_MIGRATION_TEST_DB_URL:-}"
case "$database_url" in
  postgresql://*@127.0.0.1:*/postgres*|postgres://*@127.0.0.1:*/postgres*|postgresql://*@localhost:*/postgres*|postgres://*@localhost:*/postgres*) ;;
  *) echo 'Set TRACEKIT_MIGRATION_TEST_DB_URL to a disposable local database.' >&2; exit 2 ;;
esac
[[ "${TRACEKIT_MIGRATION_TEST_DISPOSABLE:-}" == "1" ]] || { echo 'Disposable database attestation required.' >&2; exit 2; }

export PGSSLMODE=disable
psql "$database_url" -v ON_ERROR_STOP=1 <<'SQL'
begin;
do $fresh$
begin
 if exists(select 1 from public.mcp_action_intents where intent_id::text like '51000000-%') then
  raise exception 'authoritative execution harness requires a freshly migrated disposable database';
 end if;
end $fresh$;

insert into public.mcp_action_intents(intent_id,organization_id,actor_user_id,plan_identity,operation,plan,audit_correlation_id,issued_at,expires_at,target_kind,target)
select id,'8f6bb14b-2126-49b8-bfdb-c60edbc3549b',actor,
 'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
 'shopify.controlled_webhook_create_delete_proof',
 '{"operation":"shopify.controlled_webhook_create_delete_proof","connectionId":"d69a93dd-98ed-46fd-b486-1a39fb8388dd","shopDomain":"izkfvg-k0.myshopify.com","callbackUrl":"https://app.trace-kit.io/api/webhooks/shopify","topic":"APP_UNINSTALLED"}'::jsonb,
 correlation,now()-interval '1 minute',expires,'shopify_webhook_subscription',
 '{"connectionId":"d69a93dd-98ed-46fd-b486-1a39fb8388dd","shopDomain":"izkfvg-k0.myshopify.com","callbackUrl":"https://app.trace-kit.io/api/webhooks/shopify","topic":"APP_UNINSTALLED"}'::jsonb
from (values
 ('51000000-0000-4000-8000-000000000001'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-valid',now()+interval '10 minutes'),
 ('51000000-0000-4000-8000-000000000002'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-stale-intent',now()-interval '1 second'),
 ('51000000-0000-4000-8000-000000000003'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-stale-confirmation',now()+interval '10 minutes'),
 ('51000000-0000-4000-8000-000000000004'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-replay',now()-interval '1 second'),
 ('51000000-0000-4000-8000-000000000005'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-missing-result',now()+interval '10 minutes'),
 ('51000000-0000-4000-8000-000000000006'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-future',now()+interval '10 minutes'),
 ('51000000-0000-4000-8000-000000000007'::uuid,'40000000-0000-4000-8000-000000000002'::uuid,'m3-db-race',now()+interval '2 seconds')
) v(id,actor,correlation,expires);

insert into public.mcp_action_confirmations(confirmation_id,intent_id,organization_id,actor_user_id,confirmed_at,expires_at) values
 ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now(),now()+interval '5 minutes'),
 ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now()-interval '2 minutes',now()-interval '1 minute'),
 ('52000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000003','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now()-interval '2 minutes',now()-interval '1 second'),
 ('52000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000004','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now()-interval '10 minutes',now()-interval '5 minutes'),
 ('52000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000005','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now(),now()+interval '5 minutes'),
 ('52000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000006','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now(),now()+interval '5 minutes'),
 ('52000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000007','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',now(),now()+interval '2 seconds');

insert into public.mcp_action_authorizations(authorization_id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,state,expires_at,consumed_at,consumption_id,envelope_created_at) values
 ('53000000-0000-4000-8000-000000000004','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','shopify-exec-v1-replay','idem-replay','m3-db-replay','consumed',now()-interval '5 minutes',now()-interval '6 minutes','54000000-0000-4000-8000-000000000004','2026-01-01T00:00:00Z'),
 ('53000000-0000-4000-8000-000000000005','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','shopify-exec-v1-missing','idem-missing','m3-db-missing-result','consumed',now()+interval '5 minutes',now(),'54000000-0000-4000-8000-000000000005','2026-01-01T00:00:00Z');
insert into public.mcp_action_execution_results(organization_id,envelope_identity,idempotency_key,audit_correlation_id,consumption_id,result)
values('8f6bb14b-2126-49b8-bfdb-c60edbc3549b','shopify-exec-v1-replay','idem-replay','m3-db-replay','54000000-0000-4000-8000-000000000004','{"status":"completed","proof":"immutable"}');
insert into public.mcp_shopify_mutation_recovery(organization_id,intent_id,plan_identity,shop_domain,callback_url,topic,state,created_external_id,created_verified,rollback_verified,audit_correlation_id)
values('8f6bb14b-2126-49b8-bfdb-c60edbc3549b','51000000-0000-4000-8000-000000000004','provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED','izkfvg-k0.myshopify.com','https://app.trace-kit.io/api/webhooks/shopify','APP_UNINSTALLED','rollback_verified','gid://shopify/WebhookSubscription/test',true,true,'m3-db-replay');
commit;

do $test$
declare r record; before_count bigint;
begin
 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000001','shopify-exec-v1-valid','idem-valid','m3-db-valid','54000000-0000-4000-8000-000000000001','1900-01-01');
 if r.decision<>'consume' then raise exception 'valid current confirmation did not consume'; end if;
 insert into public.mcp_action_execution_results(organization_id,envelope_identity,idempotency_key,audit_correlation_id,consumption_id,result)
 values('8f6bb14b-2126-49b8-bfdb-c60edbc3549b','shopify-exec-v1-valid','idem-valid','m3-db-valid','54000000-0000-4000-8000-000000000001','{"status":"completed","proof":"valid-replay"}');
 select * into r from public.resolve_completed_mcp_shopify_execution_replay(
  '52000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','1900-01-01','idem-valid');
 if r.decision<>'replay_same_result' or r.result->>'proof'<>'valid-replay' then raise exception 'valid completed replay unavailable'; end if;

 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'wrong.operation','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000091','shopify-exec-v1-wrong-operation','idem-wrong-operation','m3-db-valid','54000000-0000-4000-8000-000000000091','1900-01-01');
 if r.decision<>'reject' then raise exception 'operation mismatch accepted'; end if;
 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','wrong_target',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000092','shopify-exec-v1-wrong-target','idem-wrong-target','m3-db-valid','54000000-0000-4000-8000-000000000092','1900-01-01');
 if r.decision<>'reject' then raise exception 'target mismatch accepted'; end if;

 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000006','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000006','shopify-exec-v1-future','idem-future','m3-db-future','54000000-0000-4000-8000-000000000006','2100-01-01');
 if r.decision<>'consume' then raise exception 'future metadata altered current authorization'; end if;

 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000002','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000002','shopify-exec-v1-stale-intent','idem-stale-intent','m3-db-stale-intent','54000000-0000-4000-8000-000000000002','1900-01-01');
 if r.decision<>'reject' then raise exception 'stale intent accepted historical metadata'; end if;

 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000003','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000003','shopify-exec-v1-stale-confirmation','idem-stale-confirmation','m3-db-stale-confirmation','54000000-0000-4000-8000-000000000003','1900-01-01');
 if r.decision<>'reject' then raise exception 'stale confirmation accepted historical metadata'; end if;

 select count(*) into before_count from public.mcp_action_authorizations;
 select * into r from public.resolve_completed_mcp_shopify_execution_replay(
  '52000000-0000-4000-8000-000000000004','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','2026-01-01T00:00:00Z','idem-replay');
 if r.decision<>'replay_same_result' or r.result->>'status'<>'completed' then raise exception 'expired completed replay unavailable'; end if;
 if (select count(*) from public.mcp_action_authorizations)<>before_count then raise exception 'replay wrote authorization'; end if;
 if (select count(*) from public.mcp_action_execution_results where audit_correlation_id='m3-db-replay')<>1 then raise exception 'replay wrote execution result'; end if;
 if (select count(*) from public.mcp_external_mutation_audit where audit_correlation_id='m3-db-replay')<>0 then raise exception 'replay wrote mutation audit'; end if;
 if not exists(select 1 from public.mcp_shopify_mutation_recovery where intent_id='51000000-0000-4000-8000-000000000004' and state='rollback_verified' and rollback_verified) then raise exception 'replay altered recovery'; end if;
 if exists(select 1 from public.resolve_completed_mcp_shopify_execution_replay('52000000-0000-4000-8000-000000000004','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002','shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','2026-01-01','wrong-key')) then raise exception 'mismatched idempotency replayed'; end if;
 if exists(select 1 from public.resolve_completed_mcp_shopify_execution_replay('52000000-0000-4000-8000-000000000001','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002','shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','2026-01-01','idem-replay')) then raise exception 'mismatched confirmation replayed'; end if;
 if exists(select 1 from public.resolve_completed_mcp_shopify_execution_replay('52000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','40000000-0000-4000-8000-000000000002','shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','2026-01-01','idem-replay')) then raise exception 'cross-tenant replayed'; end if;
 if exists(select 1 from public.resolve_completed_mcp_shopify_execution_replay('52000000-0000-4000-8000-000000000004','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','11111111-1111-4111-8111-111111111111','shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','2026-01-01','idem-replay')) then raise exception 'cross-actor replayed'; end if;

 select * into r from public.authorize_mcp_shopify_execution_atomic(
  '52000000-0000-4000-8000-000000000005','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002',
  'shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription',
  'provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED',
  '53000000-0000-4000-8000-000000000099','shopify-exec-v1-missing','idem-missing','m3-db-missing-result','54000000-0000-4000-8000-000000000099','2026-01-01');
 if r.decision<>'replay_result_unavailable' then raise exception 'consumed authorization without result did not fail closed'; end if;
end $test$;
SQL

# Hold the intent lock beyond expiry; authoritative time must be captured after
# the waiting transaction acquires it.
psql "$database_url" -v ON_ERROR_STOP=1 -c "begin; select 1 from public.mcp_action_intents where intent_id='51000000-0000-4000-8000-000000000007' for update; select pg_sleep(3); commit" >/dev/null &
locker_pid=$!
sleep 0.3
race_result="$(psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select decision from public.authorize_mcp_shopify_execution_atomic('52000000-0000-4000-8000-000000000007','8f6bb14b-2126-49b8-bfdb-c60edbc3549b','40000000-0000-4000-8000-000000000002','shopify.controlled_webhook_create_delete_proof','shopify_webhook_subscription','provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED','53000000-0000-4000-8000-000000000007','shopify-exec-v1-race','idem-race','m3-db-race','54000000-0000-4000-8000-000000000007','1900-01-01')")"
wait "$locker_pid"
[[ "$race_result" == "reject" ]] || { echo "expiry race returned $race_result" >&2; exit 1; }

psql "$database_url" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.mcp_action_authorizations where audit_correlation_id in ('m3-db-stale-intent','m3-db-stale-confirmation','m3-db-race')" | grep -qx 0
echo 'PASS: authoritative Shopify execution and replay database contract'
