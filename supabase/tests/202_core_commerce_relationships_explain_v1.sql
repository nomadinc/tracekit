begin;

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.commerce_relationship_projection_v1;
  if v_count < 0 then raise exception 'relationship projection unavailable'; end if;

  select count(*) into v_count
  from public.reconciliation_explain_projection_v1
  where result_status not in ('matched','ambiguous','duplicate','unmatched');
  if v_count <> 0 then raise exception 'invalid explain result status'; end if;

  select count(*) into v_count
  from public.reconciliation_explain_projection_v1
  where matched_canonical_order_id is not null
    and (platform_order_id is null or algorithm_version is null or match_method is null);
  if v_count <> 0 then raise exception 'matched explain rows must retain commerce identity and reconciliation method'; end if;

  select count(*) into v_count
  from public.commerce_relationship_projection_v1
  where resolution_status='unresolved' and resolution_method not like 'unresolved%';
  if v_count <> 0 then raise exception 'unresolved relationships must remain explicit'; end if;
end $$;

rollback;
