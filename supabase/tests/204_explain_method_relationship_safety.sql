begin;
do $$
declare n integer;
begin
 select count(*) into n from public.provider_order_relationship_projection_v2 where provider_group_reference like 'IDENTITY:%';
 if n<>0 then raise exception 'heuristic identity groups must never create deterministic parent relationships'; end if;
 select count(*) into n from public.reconciliation_explain_projection_v2 where result_status='matched' and explain_match_method in ('none','');
 if n<>0 then raise exception 'matched Explain rows require substantive method'; end if;
end $$;
rollback;
