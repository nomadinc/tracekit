-- Converge trigger-only guard functions to owner-only execution.
-- PostgreSQL function default privileges are intentionally left unchanged.

revoke all privileges on function
  public.commerce_provider_credential_version_guard(),
  public.commerce_evidence_immutable_guard(),
  public.tracekit_investigation_version_immutable_guard(),
  public.tracekit_investigation_branch_guard(),
  public.tracekit_investigation_branch_immutable_guard()
from public, anon, authenticated, service_role;
