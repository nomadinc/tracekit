-- PostgreSQL has no min(uuid); retain exact scoped identity and ambiguity checks.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
create or replace function public.resolve_commas_refund_created_order_v1(
 p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_original_payment_id text
) returns table(canonical_order_id uuid,match_state text)
language plpgsql security invoker stable set search_path=public,pg_temp as $$
declare v_count integer; v_order uuid;
begin
 if p_original_payment_id is null or btrim(p_original_payment_id)='' then return query select null::uuid,'missing'::text; return; end if;
 if p_original_payment_id !~ '^ORD-[A-Za-z0-9_-]{1,120}$' then return query select null::uuid,'legacy_unresolved'::text; return; end if;
 select count(*),min(canonical_object_id::text)::uuid into v_count,v_order
 from public.commerce_source_mappings
 where organization_id=p_organization_id and connection_id=p_connection_id and provider_account_id=p_provider_account_id
   and source_object_type='commas_public_transaction' and source_object_id=p_original_payment_id
   and canonical_object_type='order' and state='active';
 if v_count=1 then return query select v_order,'exact_ord'::text;
 elsif v_count=0 then return query select null::uuid,'malformed'::text;
 else raise exception 'ambiguous Commas public transaction mapping'; end if;
end $$;
commit;
