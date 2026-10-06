alter table public.mcp_action_authorizations
  add column if not exists envelope_created_at timestamptz;
comment on column public.mcp_action_authorizations.envelope_created_at is
  'Exact immutable ExecutionEnvelope.createdAt for authorizations issued after M12 deterministic replay support. Null legacy rows are intentionally not replayable by reconstruction.';
