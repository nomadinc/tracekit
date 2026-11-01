-- Git-only proposal. No source-version authority exists: established financial
-- values cannot change or disappear; NULL may become observed evidence once.
begin;
alter table public.commerce_refund_events add column next29_transaction_references jsonb;

create function public.ws001_next29_refund_guard() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare m public.commerce_source_mappings%rowtype; provider_name text; prior_provider text; item record; observed_parent text;
begin
  if TG_OP<>'DELETE' and new.next29_transaction_references is not null and jsonb_typeof(new.next29_transaction_references)<>'object' then
    raise exception 'next29 invalid transaction references' using errcode='23514';
  end if;
  if TG_OP <> 'INSERT' then
    select provider into prior_provider from public.commerce_provider_connections
      where id=old.connection_id and organization_id=old.organization_id for share;
    if prior_provider='next29' or old.next29_transaction_references is not null then
      if TG_OP='DELETE' then raise exception 'next29 financial deletion denied' using errcode='23514'; end if;
      if row(new.id,new.account_id,new.organization_id,new.connection_id,new.provider_account_id,new.canonical_order_id,new.source_mapping_id,new.provider_refund_id)
        is distinct from row(old.id,old.account_id,old.organization_id,old.connection_id,old.provider_account_id,old.canonical_order_id,old.source_mapping_id,old.provider_refund_id)
        or (old.provider_payment_id is not null and new.provider_payment_id is distinct from old.provider_payment_id)
        or (old.amount is not null and new.amount is distinct from old.amount)
        or (old.amount_gross is not null and new.amount_gross is distinct from old.amount_gross)
        or (old.currency is not null and new.currency is distinct from old.currency)
        or new.occurred_at is distinct from old.occurred_at then
        raise exception 'next29 financial conflict; no source version authority' using errcode='23514';
      end if;
      if old.next29_transaction_references is not null and old.next29_transaction_references <> '{}'::jsonb then
        if new.next29_transaction_references is null or
          (select array_agg(key order by key) from jsonb_each(old.next29_transaction_references)) is distinct from
          (select array_agg(key order by key) from jsonb_each(new.next29_transaction_references)) then
          raise exception 'next29 financial relationship conflict' using errcode='23514';
        end if;
        for item in select key,value from jsonb_each(old.next29_transaction_references) loop
          if item.value <> 'null'::jsonb and new.next29_transaction_references->item.key is distinct from item.value then
            raise exception 'next29 financial relationship conflict' using errcode='23514';
          end if;
        end loop;
      end if;
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  select provider into provider_name from public.commerce_provider_connections
    where id=new.connection_id and organization_id=new.organization_id for share;
  if provider_name is distinct from 'next29' and new.next29_transaction_references is null then return new; end if;
  if new.next29_transaction_references is null or jsonb_typeof(new.next29_transaction_references)<>'object' then
    raise exception 'next29 transaction references required' using errcode='23514';
  end if;
  for item in select key,value from jsonb_each(new.next29_transaction_references) loop
    if item.key='' or jsonb_typeof(item.value) not in ('string','null') or item.value='""'::jsonb then
      raise exception 'next29 invalid transaction reference' using errcode='23514';
    end if;
    select parent_provider_transaction_id into observed_parent
      from public.commerce_transaction_relationship_evidence
      where organization_id=new.organization_id and connection_id=new.connection_id
        and provider_account_id=new.provider_account_id and provider='next29'
        and provider_transaction_id=item.key for share;
    if found and observed_parent is not null and item.value is distinct from to_jsonb(observed_parent) then
      raise exception 'next29 retained parent evidence conflict' using errcode='23514';
    end if;
  end loop;
  if new.amount::text in ('NaN','Infinity','-Infinity') or new.amount_gross::text in ('NaN','Infinity','-Infinity') then
    raise exception 'next29 nonfinite money denied' using errcode='23514';
  end if;
  if (new.provider_payment_id is null and new.next29_transaction_references<>'{}'::jsonb)
    or (new.provider_payment_id is not null and not new.next29_transaction_references ? new.provider_payment_id) then
    raise exception 'next29 payment reference mismatch' using errcode='23514';
  end if;
  -- FOR SHARE conflicts with non-key mapping UPDATE as well as DELETE. A FK's
  -- KEY SHARE alone would not protect state/metadata/canonical target changes.
  select * into m from public.commerce_source_mappings
    where id=new.source_mapping_id and organization_id=new.organization_id
      and connection_id=new.connection_id and provider_account_id=new.provider_account_id for share;
  if not found or m.state<>'active' or m.source_object_type<>'next29_refund'
    or m.source_object_id<>new.provider_refund_id or m.canonical_object_type<>'refund'
    or m.canonical_object_id<>new.id or m.metadata->>'provider' is distinct from 'next29'
    or m.metadata->>'canonical_order_id' is distinct from new.canonical_order_id::text then
    raise exception 'next29 source mapping conflict' using errcode='23514';
  end if;
  perform 1 from public.platform_orders where canonical_order_id=new.canonical_order_id
    and organization_id=new.organization_id and account_id=new.account_id
    and connection_id=new.connection_id and provider_account_id=new.provider_account_id for share;
  if not found then raise exception 'next29 parent order scope conflict' using errcode='23514'; end if;
  perform 1 from public.commerce_evidence_records where id=new.evidence_id
    and organization_id=new.organization_id and connection_id=new.connection_id
    and provider_account_id=new.provider_account_id for share;
  if not found then raise exception 'next29 evidence scope conflict' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.ws001_next29_refund_guard() from public,anon,authenticated,service_role;
create trigger ws001_next29_refund_guard before insert or update or delete on public.commerce_refund_events
for each row execute function public.ws001_next29_refund_guard();
alter table public.commerce_refund_events enable always trigger ws001_next29_refund_guard;

-- Classification cannot be removed to bypass guards on pre-migration rows.
create function public.ws001_next29_connection_identity_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if old.provider='next29' and (TG_OP='DELETE' or
    row(new.id,new.organization_id,new.account_id,new.provider) is distinct from
    row(old.id,old.organization_id,old.account_id,old.provider)) then
    raise exception 'next29 connection identity is immutable' using errcode='23514';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.ws001_next29_connection_identity_guard() from public,anon,authenticated,service_role;
create trigger ws001_next29_connection_identity_guard before update or delete on public.commerce_provider_connections
for each row execute function public.ws001_next29_connection_identity_guard();
alter table public.commerce_provider_connections enable always trigger ws001_next29_connection_identity_guard;

-- Preserve independently retained parent evidence and the payment projection.
-- No new version, timestamp or parent authority is inferred from delivery order.
create function public.ws001_next29_parent_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if TG_TABLE_NAME='commerce_transaction_relationship_evidence' then
    if old.provider='next29' and (TG_OP='DELETE' or
      row(new.organization_id,new.connection_id,new.provider_account_id,new.provider,new.provider_order_id,new.provider_transaction_id,new.canonical_order_id)
      is distinct from row(old.organization_id,old.connection_id,old.provider_account_id,old.provider,old.provider_order_id,old.provider_transaction_id,old.canonical_order_id)
      or (old.parent_provider_transaction_id is not null and new.parent_provider_transaction_id is distinct from old.parent_provider_transaction_id)) then
      raise exception 'next29 transaction parent conflict' using errcode='23514';
    end if;
  else
    if old.platform='next29' and (TG_OP='DELETE' or
      row(new.platform,new.transaction_id,new.account_id,new.workspace_id) is distinct from row(old.platform,old.transaction_id,old.account_id,old.workspace_id)
      or (old.parent_transaction_id is not null and new.parent_transaction_id is distinct from old.parent_transaction_id)) then
      raise exception 'next29 transaction parent conflict' using errcode='23514';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.ws001_next29_parent_guard() from public,anon,authenticated,service_role;
create trigger ws001_next29_relationship_guard before update or delete on public.commerce_transaction_relationship_evidence
for each row execute function public.ws001_next29_parent_guard();
alter table public.commerce_transaction_relationship_evidence enable always trigger ws001_next29_relationship_guard;
create trigger ws001_next29_payment_parent_guard before update or delete on public.payment_transactions
for each row execute function public.ws001_next29_parent_guard();
alter table public.payment_transactions enable always trigger ws001_next29_payment_parent_guard;
-- Preserve existing DML grants; all direct DML and invoker normalizers fire the
-- guards. Table owner/superuser DDL is an administrative trust boundary.
revoke truncate on public.commerce_refund_events,public.commerce_transaction_relationship_evidence,public.payment_transactions,public.commerce_provider_connections from public,anon,authenticated,service_role;
commit;
