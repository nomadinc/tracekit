import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const run = process.env.TRACEKIT_RUN_DATABASE_BOOTSTRAP_TEST === "1";

test("Migration 063 executes, rejects a second bootstrap, and rolls back failed writes", { skip: !run }, () => {
  const root = mkdtempSync("/tmp/tracekit-bootstrap-db-");
  const socket = join(root, "socket");
  const port = "55439";
  const dbUser = process.env.USER ?? "postgres";
  const psql = (sql: string) => {
    try {
      return execFileSync("/opt/homebrew/bin/psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", port, "-U", dbUser, "-d", "postgres"], { input: sql, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
    } catch (error) {
      throw new Error(String((error as { stderr?: string }).stderr || error));
    }
  };
  try {
    execFileSync("/opt/homebrew/bin/initdb", ["-D", root, "--no-locale", "--encoding=UTF8", "-A", "trust"], { stdio: "ignore" });
    mkdirSync(socket);
    execFileSync("/opt/homebrew/bin/pg_ctl", ["-D", root, "-o", `-k ${socket} -p ${port}`, "-w", "start"], { stdio: "ignore" });
    const migration = readFileSync(new URL("../../supabase/migrations/063_first_admin_bootstrap.sql", import.meta.url), "utf8");
    psql(`create role anon; create role authenticated; create role service_role;\ncreate extension if not exists pgcrypto;
create table public.tracekit_users (id uuid primary key, status text not null, workos_user_id text not null, primary_email text not null, display_name text not null);
create table public.tracekit_accounts (id uuid primary key default gen_random_uuid(), account_type text not null, name text not null, status text not null);
create table public.tracekit_organizations (id uuid primary key default gen_random_uuid(), owning_account_id uuid not null references public.tracekit_accounts(id), name text not null, status text not null);
create table public.tracekit_roles (id uuid primary key default gen_random_uuid(), role_key text not null unique, account_type text not null, system_role boolean not null default true);
create table public.tracekit_memberships (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.tracekit_users(id), organization_id uuid not null references public.tracekit_organizations(id), role_id uuid not null references public.tracekit_roles(id), status text not null);
create table public.tracekit_audit_events (id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.tracekit_users(id), authenticated_identity_id text, account_id uuid references public.tracekit_accounts(id), organization_id uuid references public.tracekit_organizations(id), action text not null, target_type text, target_id text, result text not null, correlation_id text not null, metadata jsonb not null default '{}'::jsonb);
insert into public.tracekit_roles(role_key, account_type) values ('organization-owner', 'client');
insert into public.tracekit_users(id, status, workos_user_id, primary_email, display_name) values ('00000000-0000-0000-0000-000000000001', 'active', 'test-user', 'test@example.invalid', 'Test User');
${migration}`);
    psql(`alter table public.tracekit_audit_events add constraint bootstrap_failure check (action <> 'installation.bootstrap.completed');
do $$ begin begin perform public.bootstrap_tracekit_first_admin('00000000-0000-0000-0000-000000000001', 'test', 'Org', 'Account', 'rollback'); exception when others then null; end; if (select count(*) from public.tracekit_accounts) <> 0 or (select count(*) from public.tracekit_organizations) <> 0 or (select count(*) from public.tracekit_memberships) <> 0 then raise exception 'failed bootstrap did not roll back'; end if; end $$;
alter table public.tracekit_audit_events drop constraint bootstrap_failure;
select account_id, organization_id, membership_id, role_key from public.bootstrap_tracekit_first_admin('00000000-0000-0000-0000-000000000001', 'test', 'Org', 'Account', 'success');
do $$ declare v_role text; begin select r.role_key into v_role from public.tracekit_roles r join public.tracekit_memberships m on m.role_id = r.id; if (select count(*) from public.tracekit_accounts) <> 1 or (select count(*) from public.tracekit_organizations) <> 1 or (select count(*) from public.tracekit_memberships where status = 'active') <> 1 or v_role <> 'organization-owner' then raise exception 'successful bootstrap assertions failed'; end if; end $$;
do $$ begin begin perform public.bootstrap_tracekit_first_admin('00000000-0000-0000-0000-000000000001', 'test', 'Org 2', 'Account 2', 'second'); raise exception 'second bootstrap was accepted'; exception when others then if sqlerrm = 'second bootstrap was accepted' then raise; end if; end; if (select count(*) from public.tracekit_accounts) <> 1 or (select count(*) from public.tracekit_organizations) <> 1 or (select count(*) from public.tracekit_memberships) <> 1 then raise exception 'second bootstrap changed rows'; end if; end $$;`);
  } finally {
    try { execFileSync("/opt/homebrew/bin/pg_ctl", ["-D", root, "-w", "stop"], { stdio: "ignore" }); } catch { /* initdb/start failures may leave no server to stop */ } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
