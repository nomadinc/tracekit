create or replace function public.resolve_mcp_shopify_action_confirmation(
 p_confirmation_id uuid,
 p_organization_id uuid,
 p_actor_user_id uuid,
 p_requested_at timestamptz
)
returns table(
 confirmation_id uuid,
 intent_id uuid,
 plan_identity text,
 operation text,
 target_kind text,
 target jsonb,
 plan jsonb,
 audit_correlation_id text,
 confirmed_at timestamptz,
 intent_expires_at timestamptz,
 confirmation_expires_at timestamptz
)
language sql security definer set search_path=public as $$
 select c.confirmation_id,i.intent_id,i.plan_identity,i.operation,i.target_kind,i.target,i.plan,i.audit_correlation_id,c.confirmed_at,i.expires_at,c.expires_at
 from public.mcp_action_confirmations c
 join public.mcp_action_intents i on i.intent_id=c.intent_id
 where c.confirmation_id=p_confirmation_id
 and c.organization_id=p_organization_id
 and c.actor_user_id=p_actor_user_id
 and i.organization_id=p_organization_id
 and i.actor_user_id=p_actor_user_id
 and i.operation='shopify.controlled_webhook_create_delete_proof'
 and i.target_kind='shopify_webhook_subscription'
 and i.expires_at>p_requested_at
 and c.expires_at>p_requested_at
$$;
revoke all on function public.resolve_mcp_shopify_action_confirmation(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.resolve_mcp_shopify_action_confirmation(uuid,uuid,uuid,timestamptz) to service_role;
