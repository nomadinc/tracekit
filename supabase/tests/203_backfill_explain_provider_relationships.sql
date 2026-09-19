begin;
do $$
declare n integer;
begin
 select count(*) into n from public.reconciliation_explain_projection_v1
 where matched_canonical_order_id is not null and evidence_id is null;
 if n<>0 then raise exception 'matched explain decisions must retain evidence'; end if;

 select count(*) into n from public.provider_order_relationship_projection_v1
 where sequence_position>0 and parent_canonical_order_id is null;
 if n<>0 then raise exception 'provider-group children require deterministic parents'; end if;

 select count(*) into n from public.commerce_relationship_projection_v2
 where resolution_status not in ('resolved','unresolved');
 if n<>0 then raise exception 'invalid relationship resolution status'; end if;
end $$;
rollback;
