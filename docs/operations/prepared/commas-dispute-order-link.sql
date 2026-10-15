-- REVIEW FIXTURE ONLY. Outside supabase/migrations; no deployment or runtime grants.
-- The trusted verifier must hash-check retained bytes and bind the confirmed
-- provider payload fields before inserting verified_identity. This SQL cannot
-- independently hash object-storage bytes. Never expose enrollment to clients.
create schema ws001_dispute_preparation;
revoke all on schema ws001_dispute_preparation from public,anon,authenticated,service_role;
create table ws001_dispute_preparation.verified_identity (
 event_id uuid primary key,
 evidence_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 numeric_transaction_id text,
 public_order_id text,
 verifier_version text not null check(length(btrim(verifier_version))>0),
 verified_at timestamptz not null default now()
);
create table ws001_dispute_preparation.identity_audit (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, connection_id uuid not null, provider_account_id uuid not null,
 dispute_id uuid not null, provider_dispute_id text not null,
 event_id uuid not null, evidence_id uuid not null, payload_hash text not null,
 numeric_transaction_id text, public_order_id text,
 numeric_mapping_id uuid, public_mapping_id uuid,
 canonical_order_id uuid not null,
 previous_order_id uuid, previous_reconciliation_state text not null,
 verifier_version text not null,
 created_at timestamptz not null default now(),
 unique(dispute_id,event_id)
);
alter table ws001_dispute_preparation.verified_identity enable row level security;
alter table ws001_dispute_preparation.identity_audit enable row level security;
revoke all on all tables in schema ws001_dispute_preparation from public,anon,authenticated,service_role;
create function ws001_dispute_preparation.immutable_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'prepared_identity_evidence_and_audit_are_immutable'; end $$;
create trigger verified_identity_immutable before update or delete on ws001_dispute_preparation.verified_identity
 for each row execute function ws001_dispute_preparation.immutable_guard();
create trigger identity_audit_immutable before update or delete on ws001_dispute_preparation.identity_audit
 for each row execute function ws001_dispute_preparation.immutable_guard();
create trigger identity_audit_no_truncate before truncate on ws001_dispute_preparation.identity_audit
 for each statement execute function ws001_dispute_preparation.immutable_guard();

create function ws001_dispute_preparation.link_order(
 p_org uuid,p_connection uuid,p_account uuid,p_dispute text,p_event uuid
) returns text language plpgsql security invoker set search_path='' as $$
declare
 d public.commerce_provider_disputes%rowtype;
 e public.commerce_dispute_webhook_events%rowtype;
 proof ws001_dispute_preparation.verified_identity%rowtype;
 m public.commerce_source_mappings%rowtype;
 n_order uuid; o_order uuid; target uuid; n_mapping uuid; o_mapping uuid;
begin
 if p_org is null or p_connection is null or p_account is null or nullif(btrim(p_dispute),'') is null then return 'hold:scope_missing'; end if;
 select * into d from public.commerce_provider_disputes
 where organization_id=p_org and connection_id=p_connection and provider_account_id=p_account and provider_dispute_id=p_dispute for update;
 if not found then return 'hold:dispute_missing'; end if;
 select * into e from public.commerce_dispute_webhook_events
 where id=p_event and organization_id=p_org and connection_id=p_connection and provider_account_id=p_account
 and provider_dispute_id=p_dispute and event_type in ('dispute.created','dispute.updated') for share;
 if not found then return 'hold:event_scope_conflict'; end if;
 select * into proof from ws001_dispute_preparation.verified_identity where event_id=e.id for share;
 if not found or proof.evidence_id<>e.evidence_id or proof.payload_hash<>e.payload_hash then return 'hold:verified_evidence_required'; end if;
 perform 1 from public.commerce_evidence_records where id=proof.evidence_id
 and organization_id=p_org and connection_id=p_connection and provider_account_id=p_account
 and payload_hash=proof.payload_hash and source_object_type='commas_dispute_webhook'
 and source_object_id=e.provider_event_id and pii_classification='restricted' and deleted_at is null for share;
 if not found then return 'hold:evidence_scope_conflict'; end if;
 if (proof.numeric_transaction_id is not null and proof.numeric_transaction_id !~ '^[1-9][0-9]*$')
 or (proof.public_order_id is not null and proof.public_order_id !~ '^ORD-[A-Za-z0-9_-]{1,120}$') then return 'hold:malformed_identity'; end if;
 if proof.numeric_transaction_id is null and proof.public_order_id is null then return 'hold:identity_missing'; end if;
 -- Existing unique source identity key plus row locks prevent replacement of
 -- resolved mappings during this transaction. Missing identities hold immediately.
 if proof.numeric_transaction_id is not null then
  select * into m from public.commerce_source_mappings where organization_id=p_org and connection_id=p_connection
  and provider_account_id=p_account and source_object_type='transaction' and source_object_id=proof.numeric_transaction_id for share;
  if not found or m.state<>'active' or m.canonical_object_type<>'order' then return 'hold:numeric_mapping_unavailable'; end if;
  n_order=m.canonical_object_id; n_mapping=m.id;
 end if;
 if proof.public_order_id is not null then
  select * into m from public.commerce_source_mappings where organization_id=p_org and connection_id=p_connection
  and provider_account_id=p_account and source_object_type='commas_public_transaction' and source_object_id=proof.public_order_id for share;
  if not found or m.state<>'active' or m.canonical_object_type<>'order' then return 'hold:public_mapping_unavailable'; end if;
  o_order=m.canonical_object_id; o_mapping=m.id;
 end if;
 if n_order is not null and o_order is not null and n_order<>o_order then return 'hold:identifiers_disagree'; end if;
 target=coalesce(n_order,o_order);
 perform 1 from public.platform_orders where organization_id=p_org and connection_id=p_connection
 and provider_account_id=p_account and canonical_order_id=target for share;
 if not found then return 'hold:order_scope_conflict'; end if;
 if d.matched_canonical_order_id is not null and d.matched_canonical_order_id<>target then return 'hold:existing_link_conflict'; end if;
 if d.matched_canonical_order_id=target and d.reconciliation_state='matched' then return 'noop'; end if;
 insert into ws001_dispute_preparation.identity_audit(organization_id,connection_id,provider_account_id,dispute_id,provider_dispute_id,event_id,evidence_id,payload_hash,numeric_transaction_id,public_order_id,numeric_mapping_id,public_mapping_id,canonical_order_id,previous_order_id,previous_reconciliation_state,verifier_version)
 values(p_org,p_connection,p_account,d.id,p_dispute,e.id,proof.evidence_id,proof.payload_hash,proof.numeric_transaction_id,proof.public_order_id,n_mapping,o_mapping,target,d.matched_canonical_order_id,d.reconciliation_state,proof.verifier_version);
 update public.commerce_provider_disputes set matched_canonical_order_id=target,reconciliation_state='matched' where id=d.id;
 return 'linked';
end $$;
revoke all on all functions in schema ws001_dispute_preparation from public,anon,authenticated,service_role;
-- NO GRANTS. Enrollment, invocation and production integration are disabled.
