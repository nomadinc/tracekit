\set ON_ERROR_STOP on
BEGIN;
do $$
declare account uuid:=gen_random_uuid(); tenant uuid:=gen_random_uuid(); other_tenant uuid:=gen_random_uuid(); conn uuid:=gen_random_uuid(); provider_account uuid:=gen_random_uuid(); other_account uuid:=gen_random_uuid(); run uuid:=gen_random_uuid(); evidence uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); other_customer uuid:=gen_random_uuid(); resolved uuid;
begin
 insert into tracekit_accounts(id,account_type,name) values(account,'client','Synthetic');
 insert into tracekit_organizations(id,owning_account_id,name) values(tenant,account,'Synthetic'),(other_tenant,account,'Other');
 insert into commerce_provider_connections(id,organization_id,account_id,provider,display_name) values(conn,tenant,account,'next29','Synthetic');
 insert into commerce_provider_accounts(id,organization_id,connection_id,provider_account_external_id) values(provider_account,tenant,conn,'one'),(other_account,tenant,conn,'two');
 insert into commerce_sync_runs(id,organization_id,connection_id,provider_account_id,sync_type,mode,status) values(run,tenant,conn,provider_account,'orders','shadow','completed');
 insert into commerce_evidence_records(id,organization_id,connection_id,provider_account_id,sync_run_id,source_object_type,source_object_id,payload_hash,storage_backend,storage_reference,byte_size,observed_at,pii_classification,retention_policy) values(evidence,tenant,conn,provider_account,run,'orders','test','synthetic','managed_evidence_store',evidence::text,0,now(),'none','test');
 insert into people(id,organization_id,workspace_id,status) values(customer,tenant,tenant::text,'active'),(other_customer,other_tenant,other_tenant::text,'active');
 insert into person_source_identities(organization_id,connection_id,provider_account_id,person_id,source_type,source_id,status,first_seen_at,last_seen_at,evidence_id) values(tenant,conn,provider_account,customer,'provider_customer_id','provider-user','observed',now(),now(),evidence);
 insert into platform_orders(platform,platform_order_id,workspace_id,organization_id,connection_id,provider_account_id,order_ts,status,currency,raw_json,evidence_id) values('next29','ws020:test:exact',tenant::text,tenant,conn,provider_account,now(),'paid','USD','{"user":{"id":"provider-user"}}',evidence);
 select resolved_person_id into resolved from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact';
 assert resolved=customer, 'exact provider scope must resolve';
 assert (select person_id is null and identity_resolution='exact_provider_identity' from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact');
 assert (select person_id is null and raw_json='{"user":{"id":"provider-user"}}'::jsonb and evidence_id=evidence from platform_orders where platform_order_id='ws020:test:exact'), 'source evidence unchanged';
 update platform_orders set provider_account_id=other_account where platform_order_id='ws020:test:exact';
 assert (select resolved_person_id is null from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact'), 'other provider account cannot match';
 update platform_orders set provider_account_id=provider_account, workspace_id=other_tenant::text where platform_order_id='ws020:test:exact';
 assert (select resolved_person_id is null from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact'), 'workspace mismatch cannot match';
 update platform_orders set workspace_id=tenant::text where platform_order_id='ws020:test:exact';
 update person_source_identities set status='disputed' where person_id=customer;
 assert (select resolved_person_id is null from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact'), 'disputed identity cannot match';
 update person_source_identities set status='observed' where person_id=customer;
 update people set status='suppressed' where id=customer;
 assert (select resolved_person_id is null from tracekit_customer_order_read_model where platform_order_id='ws020:test:exact'), 'suppressed customer cannot match';
 assert not has_table_privilege('anon','tracekit_customer_order_read_model','SELECT');
 assert not has_table_privilege('authenticated','tracekit_customer_order_read_model','SELECT');
 raise notice 'Exact scoped customer resolution, source preservation and negative cases passed';
end $$;
ROLLBACK;
