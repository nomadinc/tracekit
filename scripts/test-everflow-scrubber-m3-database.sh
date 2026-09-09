#!/usr/bin/env bash
set -euo pipefail

SCRUBBER_M3_DB="tracekit_scrubber_m3_${$}"
SCRUBBER_M3_ADMIN="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
SCRUBBER_M3_URL="postgresql://postgres:postgres@127.0.0.1:54322/${SCRUBBER_M3_DB}"
SCRUBBER_M3_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() { dropdb --if-exists --force --maintenance-db="$SCRUBBER_M3_ADMIN" "$SCRUBBER_M3_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb --maintenance-db="$SCRUBBER_M3_ADMIN" "$SCRUBBER_M3_DB"

psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create table public.commerce_provider_connections (
  id uuid primary key, account_id uuid not null, organization_id uuid not null,
  provider text not null, status text not null, unique(organization_id,id)
);
create table public.commerce_provider_accounts (
  id uuid primary key, organization_id uuid not null, connection_id uuid not null,
  unique(organization_id,connection_id,id)
);
SQL
psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_M3_ROOT/supabase/migrations/089_everflow_affiliates_v1.sql" >/dev/null
psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_M3_ROOT/supabase/migrations/091_everflow_offers_v1.sql" >/dev/null
psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_M3_ROOT/supabase/migrations/20260909171315_everflow_external_conversion_scrubber_v1.sql" >/dev/null
psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_M3_ROOT/supabase/migrations/20260909171935_everflow_scrubber_atomic_decision_v1.sql" >/dev/null
psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 -f "$SCRUBBER_M3_ROOT/supabase/migrations/20260909175730_everflow_scrubber_admin_and_sync_audit_v1.sql" >/dev/null

psql "$SCRUBBER_M3_URL" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.commerce_provider_connections(id,account_id,organization_id,provider,status)
values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','everflow','connected');
insert into public.commerce_provider_accounts(id,organization_id,connection_id)
values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
insert into public.everflow_scrubber_settings(organization_id,connection_id,provider_account_id,global_pass_rate)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',0.8);
insert into public.everflow_scrubber_sources(id,organization_id,connection_id,source_key,display_name,token_sha256)
values('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','m3_test','M3 Test',repeat('d',64));

-- Metadata upsert changes descriptive state and retains a different historical row.
insert into public.everflow_affiliates(organization_id,connection_id,provider_account_id,network_affiliate_id,name,account_status,payload_hash)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','107','Old Name','active',repeat('a',64)),
      ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','999','Historical Affiliate','inactive',repeat('b',64));
insert into public.everflow_affiliates(organization_id,connection_id,provider_account_id,network_affiliate_id,name,account_status,payload_hash,last_seen_at,updated_at)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','107','New Name','inactive',repeat('c',64),now(),now())
on conflict(connection_id,provider_account_id,network_affiliate_id) do update set name=excluded.name,account_status=excluded.account_status,payload_hash=excluded.payload_hash,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at;

insert into public.everflow_offers(organization_id,connection_id,provider_account_id,network_offer_id,network_advertiser_id,name,offer_status,payload_hash)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','52','8','Old Offer','active',repeat('a',64)),
      ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','88','9','Historical Offer','deleted',repeat('b',64));
insert into public.everflow_offers(organization_id,connection_id,provider_account_id,network_offer_id,network_advertiser_id,name,offer_status,payload_hash,last_seen_at,updated_at)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','52','10','New Offer','paused',repeat('c',64),now(),now())
on conflict(connection_id,provider_account_id,network_offer_id) do update set network_advertiser_id=excluded.network_advertiser_id,name=excluded.name,offer_status=excluded.offer_status,payload_hash=excluded.payload_hash,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at;

select public.set_everflow_scrubber_pair_rule_v1('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','52','107',0.8,null,'initial');
select conversion_id from public.decide_everflow_scrubber_conversion_v1(gen_random_uuid(),'10000000-0000-4000-8000-000000000004',repeat('1',64),'before','52','107','BEFORE','purchase',null,null,10,'USD','1.2.3.4',null,null,true,0.1,'{}','{}');
select public.set_everflow_scrubber_pair_rule_v1('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','52','107',0.6,null,'immediate change');
select conversion_id from public.decide_everflow_scrubber_conversion_v1(gen_random_uuid(),'10000000-0000-4000-8000-000000000004',repeat('2',64),'after','52','107','AFTER','purchase',null,null,10,'USD','1.2.3.4',null,null,true,0.1,'{}','{}');

do $$
declare v_before record; v_after record;
begin
  if (select count(*) from public.everflow_affiliates) <> 2 then raise exception 'affiliate retention failed'; end if;
  if not exists(select 1 from public.everflow_affiliates where network_affiliate_id='107' and name='New Name' and account_status='inactive') then raise exception 'affiliate upsert failed'; end if;
  if (select count(*) from public.everflow_offers) <> 2 then raise exception 'offer retention failed'; end if;
  if not exists(select 1 from public.everflow_offers where network_offer_id='52' and name='New Offer' and offer_status='paused' and network_advertiser_id='10') then raise exception 'offer upsert failed'; end if;
  select effective_pass_rate,rule_period_id into strict v_before from public.everflow_scrubber_conversions where transaction_id='before';
  select effective_pass_rate,rule_period_id into strict v_after from public.everflow_scrubber_conversions where transaction_id='after';
  if v_before.effective_pass_rate <> 0.8 or v_after.effective_pass_rate <> 0.6 or v_before.rule_period_id=v_after.rule_period_id then raise exception 'immediate rule change failed'; end if;
  if not exists(select 1 from public.everflow_scrubber_periods where id=v_before.rule_period_id and ended_at is not null) then raise exception 'old period remained active'; end if;
  if has_function_privilege('anon','public.set_everflow_scrubber_pair_rule_v1(uuid,uuid,text,text,numeric,uuid,text)','EXECUTE') then raise exception 'anon can mutate pair rules'; end if;
  if has_function_privilege('authenticated','public.update_everflow_scrubber_global_v1(uuid,uuid,numeric,boolean,uuid)','EXECUTE') then raise exception 'authenticated can mutate settings'; end if;
  if not (select relrowsecurity from pg_class where relname='everflow_metadata_sync_runs') then raise exception 'metadata audit RLS disabled'; end if;
  raise notice 'AFFILIATE SYNC UPSERT RETENTION PASS';
  raise notice 'OFFER SYNC UPSERT RETENTION PASS';
  raise notice 'RULE CHANGE IMMEDIATE-EFFECT PASS';
  raise notice 'ADMIN RPC SECURITY PASS';
end $$;
SQL
