alter table public.mcp_action_authorizations add column if not exists envelope_created_at timestamptz;
update public.mcp_action_authorizations set envelope_created_at=consumed_at where envelope_created_at is null and state='consumed';
alter table public.mcp_action_authorizations alter column envelope_created_at set not null;
