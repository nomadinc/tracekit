create or replace function public.mcp_action_authorization_consumption_invariant(p_authorization_id uuid)
returns table(authorization_id uuid,state text,consumption_id uuid,consumed_at timestamptz,invariant_ok boolean)
language sql security definer set search_path=public as $$
 select a.authorization_id,a.state,a.consumption_id,a.consumed_at,
   case when a.state='consumed' then a.consumption_id is not null and a.consumed_at is not null
        else a.consumption_id is null and a.consumed_at is null end
 from public.mcp_action_authorizations a where a.authorization_id=p_authorization_id
$$;
revoke all on function public.mcp_action_authorization_consumption_invariant(uuid) from public,anon,authenticated;
grant execute on function public.mcp_action_authorization_consumption_invariant(uuid) to service_role;
