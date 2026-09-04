begin;

alter table public.everflow_cron_runs
  add column if not exists scheduler_version text,
  add column if not exists deployment_commit_sha text,
  add column if not exists deployment_git_ref text;

commit;
