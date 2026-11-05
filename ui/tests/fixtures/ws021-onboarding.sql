-- Disposable PostgreSQL fixture only; never install this file in a hosted database.
create role anon; create role authenticated; create role service_role bypassrls;
create table public.tracekit_users(id uuid primary key,workos_user_id text unique,primary_email text,status text default 'active');
create table public.tracekit_accounts(id uuid primary key default gen_random_uuid(),name text,account_type text,status text default 'active');
create table public.tracekit_organizations(id uuid primary key default gen_random_uuid(),owning_account_id uuid,name text,status text default 'active');
create table public.tracekit_agencies(account_id uuid,name text);
create table public.tracekit_roles(id uuid primary key,role_key text,account_type text);
create table public.tracekit_invitations(id uuid primary key,inviter_user_id uuid,intended_email text,target_account_id uuid,target_organization_id uuid,requested_role_id uuid,status text default 'pending',expires_at timestamptz,accepted_by_user_id uuid,accepted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),business_context_ids text[] not null default '{}');
create table public.tracekit_memberships(id uuid primary key default gen_random_uuid(),user_id uuid,account_id uuid,organization_id uuid,role_id uuid,invitation_id uuid,status text default 'active',effective_from timestamptz default now(),effective_until timestamptz,updated_at timestamptz default now());
create table public.tracekit_business_contexts(id text primary key,account_id uuid not null,organization_id uuid not null,name text not null,status text default 'active',fulfillment_type text default 'unknown',metadata jsonb default '{}',created_at timestamptz default now());
create table public.tracekit_business_context_access(id uuid primary key default gen_random_uuid(),membership_id uuid,organization_id uuid,business_context_id text,status text default 'active');
create table public.tracekit_permission_overrides(id uuid primary key default gen_random_uuid(),membership_id uuid,organization_id uuid,capability text,effect text,resource_type text,resource_id text,created_by_user_id uuid,reason text not null);
create table public.tracekit_audit_events(actor_user_id uuid,authenticated_identity_id text,account_id uuid,organization_id uuid,action text,target_type text,target_id text,result text,permission_evaluated text,correlation_id text,metadata jsonb);
grant all on all tables in schema public to service_role;
insert into public.tracekit_users values
 ('00000000-0000-4000-8000-000000000001','fixture-admin','admin@example.test','active'),
 ('00000000-0000-4000-8000-000000000002','fixture-customer','customer@example.test','active'),
 ('00000000-0000-4000-8000-000000000003','fixture-other','other@example.test','active');
insert into public.tracekit_accounts(id,name,account_type) values
 ('00000000-0000-4000-8000-000000000101','Platform','platform'),
 ('00000000-0000-4000-8000-000000000102','Fixture NH','client'),
 ('00000000-0000-4000-8000-000000000103','Fixture foreign','client');
insert into public.tracekit_organizations(id,owning_account_id,name) values
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000102','Fixture NH'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000103','Fixture foreign');
insert into public.tracekit_roles values
 ('00000000-0000-4000-8000-000000000301','platform-owner','platform'),
 ('00000000-0000-4000-8000-000000000302','client-read-only','client');
insert into public.tracekit_memberships(id,user_id,account_id,organization_id,role_id,effective_from) values
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',null,'00000000-0000-4000-8000-000000000301','2020-01-01');
