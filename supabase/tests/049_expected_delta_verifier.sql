begin;

-- Component-level Migration-049 verifier.  The snapshots deliberately remove
-- only the source-authorized additions; every other catalog component remains
-- part of the comparison contract.
select plan(32);

create temp table m049_baseline_columns as
select table_name, column_name, ordinal_position, data_type, udt_schema, udt_name,
       is_nullable, column_default, is_identity, identity_generation,
       is_generated, generation_expression
from information_schema.columns
where table_schema='public'
  and table_name in ('tracekit_investigation_versions','tracekit_investigations')
  and not (table_name='tracekit_investigations' and column_name in
    ('parent_investigation_id','parent_investigation_version_id','branch_signal','branch_reason'));

create temp table m049_baseline_indexes as
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('tracekit_investigation_versions','tracekit_investigations')
  and indexname not in ('tracekit_investigation_versions_org_investigation_id_uidx','tracekit_investigations_parent_idx');

create temp table m049_baseline_constraints as
select c.conrelid::regclass::text as rel, c.conname,
       pg_get_constraintdef(c.oid) as condef, c.convalidated
from pg_constraint c
where c.conrelid in ('public.tracekit_investigation_versions'::regclass,'public.tracekit_investigations'::regclass)
  and c.conname not in ('tracekit_investigations_not_self_parent','tracekit_investigations_branch_context_check',
                        'tracekit_investigations_parent_org_fk','tracekit_investigations_parent_version_fk');

create temp table m049_baseline_triggers as
select tgrelid::regclass::text as rel, tgname, pg_get_triggerdef(oid) as tgdef, tgenabled
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.tracekit_investigation_versions'::regclass,'public.tracekit_investigations'::regclass)
  and tgname not in ('tracekit_investigation_branch_cycle_guard','tracekit_investigation_branch_immutable');

create temp table m049_baseline_meta as
select c.oid::regclass::text as rel, r.rolname as owner, c.relrowsecurity, c.relforcerowsecurity,
       coalesce(c.relacl::text,'NULL') as acl,
       (select count(*) from pg_catalog.pg_class x where x.oid=c.oid) as object_marker,
       case when c.oid='public.tracekit_investigation_versions'::regclass then
         (select count(*) from public.tracekit_investigation_versions)
       else (select count(*) from public.tracekit_investigations) end as row_count
from pg_class c join pg_roles r on r.oid=c.relowner
where c.oid in ('public.tracekit_investigation_versions'::regclass,'public.tracekit_investigations'::regclass);

create or replace function pg_temp.m049_verify()
returns text[] language plpgsql as $$
declare m text[] := '{}'; r record; actual text; expected text;
begin
  -- Baseline columns and exact authorized columns.
  for r in select * from m049_baseline_columns loop
    select format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,coalesce(column_default,''),is_identity,coalesce(identity_generation,''),is_generated,coalesce(generation_expression,'')) into actual
      from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name=r.column_name;
    expected := format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',r.table_name,r.column_name,r.ordinal_position,r.data_type,r.udt_schema,r.udt_name,r.is_nullable,coalesce(r.column_default,''),r.is_identity,coalesce(r.identity_generation,''),r.is_generated,coalesce(r.generation_expression,''));
    if actual is distinct from expected then m := array_append(m,'column:'||r.table_name||'.'||r.column_name); end if;
  end loop;
  foreach expected in array array['parent_investigation_id|uuid|YES|','parent_investigation_version_id|uuid|YES|','branch_signal|text|YES|','branch_reason|text|YES|'] loop
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='tracekit_investigations' and (c.column_name||'|'||c.udt_name||'|'||c.is_nullable||'|'||coalesce(c.column_default,''))=expected) then m := array_append(m,'authorized-column:'||split_part(expected,'|',1)); end if;
  end loop;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='tracekit_investigations') <> (select count(*) from m049_baseline_columns where table_name='tracekit_investigations')+4 then m := array_append(m,'column-set:tracekit_investigations'); end if;

  -- Baseline indexes plus exact authorized additions.
  for r in select * from m049_baseline_indexes loop
    select indexdef into actual from pg_indexes where schemaname=r.schemaname and tablename=r.tablename and indexname=r.indexname;
    if actual is distinct from r.indexdef then m := array_append(m,'index:'||r.indexname); end if;
  end loop;
  if (select indexdef from pg_indexes where schemaname='public' and indexname='tracekit_investigation_versions_org_investigation_id_uidx') is distinct from 'CREATE UNIQUE INDEX tracekit_investigation_versions_org_investigation_id_uidx ON public.tracekit_investigation_versions USING btree (organization_id, investigation_id, id)' then m := array_append(m,'index:versions-authorized'); end if;
  if (select indexdef from pg_indexes where schemaname='public' and indexname='tracekit_investigations_parent_idx') is distinct from 'CREATE INDEX tracekit_investigations_parent_idx ON public.tracekit_investigations USING btree (organization_id, parent_investigation_id, updated_at DESC) WHERE (parent_investigation_id IS NOT NULL)' then m := array_append(m,'index:investigations-authorized'); end if;
  if (select count(*) from pg_indexes where schemaname='public' and tablename in ('tracekit_investigation_versions','tracekit_investigations')) <> (select count(*) from m049_baseline_indexes)+2 then m := array_append(m,'index-set'); end if;

  -- Constraints and trigger definitions are compared component-wise.
  for r in select * from m049_baseline_constraints loop
    select pg_get_constraintdef(oid),convalidated into actual,r.convalidated from pg_constraint where conrelid=r.rel::regclass and conname=r.conname;
    if actual is distinct from r.condef then m := array_append(m,'constraint:'||r.conname); end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid='public.tracekit_investigations'::regclass and conname='tracekit_investigations_not_self_parent' and pg_get_constraintdef(oid)='CHECK (((parent_investigation_id IS NULL) OR (parent_investigation_id <> id)))' and convalidated) then m := array_append(m,'constraint:not-self'); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.tracekit_investigations'::regclass and conname='tracekit_investigations_branch_context_check' and convalidated) then m := array_append(m,'constraint:branch-context'); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.tracekit_investigations'::regclass and conname='tracekit_investigations_parent_org_fk' and convalidated) then m := array_append(m,'constraint:parent-org'); end if;
  if not exists (select 1 from pg_constraint where conrelid='public.tracekit_investigations'::regclass and conname='tracekit_investigations_parent_version_fk' and convalidated) then m := array_append(m,'constraint:parent-version'); end if;
  if (select count(*) from pg_constraint where conrelid in ('public.tracekit_investigation_versions'::regclass,'public.tracekit_investigations'::regclass)) <> (select count(*) from m049_baseline_constraints)+4 then m := array_append(m,'constraint-set'); end if;
  for r in select * from m049_baseline_triggers loop
    select pg_get_triggerdef(oid),tgenabled into actual,r.tgenabled from pg_trigger where tgrelid=r.rel::regclass and tgname=r.tgname and not tgisinternal;
    if actual is distinct from r.tgdef then m := array_append(m,'trigger:'||r.tgname); end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid='public.tracekit_investigations'::regclass and tgname='tracekit_investigation_branch_cycle_guard' and tgenabled='O' and pg_get_triggerdef(oid)='CREATE TRIGGER tracekit_investigation_branch_cycle_guard BEFORE INSERT OR UPDATE OF parent_investigation_id, organization_id ON public.tracekit_investigations FOR EACH ROW EXECUTE FUNCTION tracekit_investigation_branch_guard()') then m := array_append(m,'trigger:branch-cycle'); end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.tracekit_investigations'::regclass and tgname='tracekit_investigation_branch_immutable' and tgenabled='O' and pg_get_triggerdef(oid)='CREATE TRIGGER tracekit_investigation_branch_immutable BEFORE UPDATE OF parent_investigation_id, parent_investigation_version_id, branch_signal, branch_reason ON public.tracekit_investigations FOR EACH ROW EXECUTE FUNCTION tracekit_investigation_branch_immutable_guard()') then m := array_append(m,'trigger:branch-immutable'); end if;

  for r in select * from m049_baseline_meta loop
    select rr.rolname into actual from pg_class c join pg_roles rr on rr.oid=c.relowner where c.oid=r.rel::regclass;
    if actual is distinct from r.owner then m := array_append(m,'owner:'||r.rel); end if;
    if (select relrowsecurity from pg_class where oid=r.rel::regclass) is distinct from r.relrowsecurity then m := array_append(m,'rls:'||r.rel); end if;
    if (select relforcerowsecurity from pg_class where oid=r.rel::regclass) is distinct from r.relforcerowsecurity then m := array_append(m,'forced-rls:'||r.rel); end if;
    if coalesce((select relacl::text from pg_class where oid=r.rel::regclass),'NULL') is distinct from r.acl then m := array_append(m,'acl:'||r.rel); end if;
    if (case when r.rel='public.tracekit_investigation_versions' then (select count(*) from public.tracekit_investigation_versions) else (select count(*) from public.tracekit_investigations) end) is distinct from r.row_count then m := array_append(m,'rows:'||r.rel); end if;
  end loop;
  if exists (select 1 from pg_policy where polrelid in ('public.tracekit_investigation_versions'::regclass,'public.tracekit_investigations'::regclass)) then m := array_append(m,'policy-set'); end if;
  if md5(pg_get_functiondef('public.tracekit_investigation_branch_guard()'::regprocedure)) <> '10ead6e3de29015169991238dc86984d' then m := array_append(m,'function:branch-guard-body'); end if;
  if md5(pg_get_functiondef('public.tracekit_investigation_branch_immutable_guard()'::regprocedure)) <> '23194468f9067c1354ab9215d01d95c9' then m := array_append(m,'function:branch-immutable-body'); end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure) <> 'postgres' then m := array_append(m,'function:branch-guard-owner'); end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure) <> 'postgres' then m := array_append(m,'function:branch-immutable-owner'); end if;
  if (select prosecdef from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure) then m := array_append(m,'function:branch-guard-security'); end if;
  if (select prosecdef from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure) then m := array_append(m,'function:branch-immutable-security'); end if;
  if (select coalesce(proconfig::text,'NULL') from pg_proc where oid='public.tracekit_investigation_branch_guard()'::regprocedure) is distinct from '{"search_path=public, pg_temp"}' then m := array_append(m,'function:branch-guard-config'); end if;
  if (select coalesce(proconfig::text,'NULL') from pg_proc where oid='public.tracekit_investigation_branch_immutable_guard()'::regprocedure) is distinct from '{"search_path=public, pg_temp"}' then m := array_append(m,'function:branch-immutable-config'); end if;
  foreach expected in array array['public.tracekit_investigation_branch_guard()','public.tracekit_investigation_branch_immutable_guard()'] loop
    if not has_function_privilege('postgres',expected,'execute') or has_function_privilege('service_role',expected,'execute') or has_function_privilege('public',expected,'execute') or has_function_privilege('anon',expected,'execute') or has_function_privilege('authenticated',expected,'execute') then m := array_append(m,'function-acl:'||expected); end if;
  end loop;
  return m;
end $$;

select ok(cardinality(pg_temp.m049_verify())=0,'positive component verifier passes with zero mismatches');

-- Adversarial matrix.  Each mutation is isolated by a savepoint and the
-- verifier returns component labels, making failures diagnosable.
savepoint m049_a; drop index public.tracekit_investigation_versions_org_investigation_id_uidx cascade; create index tracekit_investigation_versions_org_investigation_id_uidx on public.tracekit_investigation_versions (organization_id); select ok(cardinality(pg_temp.m049_verify())>0,'wrong versions index definition rejected'); rollback to savepoint m049_a;
savepoint m049_b; drop index public.tracekit_investigation_versions_org_investigation_id_uidx cascade; select ok(cardinality(pg_temp.m049_verify())>0,'missing versions index rejected'); rollback to savepoint m049_b;
savepoint m049_c; create index m049_unexpected_versions_idx on public.tracekit_investigation_versions (id); select ok(cardinality(pg_temp.m049_verify())>0,'unexpected versions index rejected'); rollback to savepoint m049_c;
savepoint m049_d; drop index public.tracekit_investigation_versions_org_investigation_id_uidx cascade; create unique index tracekit_investigation_versions_org_investigation_id_uidx on public.tracekit_investigation_versions (organization_id, investigation_id); select ok(cardinality(pg_temp.m049_verify())>0,'wrong unique versions index rejected'); rollback to savepoint m049_d;
savepoint m049_e; drop index public.tracekit_investigations_parent_idx; select ok(cardinality(pg_temp.m049_verify())>0,'missing parent index rejected'); rollback to savepoint m049_e;
savepoint m049_f; create index m049_unexpected_parent_idx on public.tracekit_investigations (id); select ok(cardinality(pg_temp.m049_verify())>0,'unexpected investigations index rejected'); rollback to savepoint m049_f;
savepoint m049_g; alter table public.tracekit_investigations alter column branch_signal set not null; select ok(cardinality(pg_temp.m049_verify())>0,'wrong branch-column nullability rejected'); rollback to savepoint m049_g;
savepoint m049_h; alter table public.tracekit_investigations add column m049_unexpected text; select ok(cardinality(pg_temp.m049_verify())>0,'unexpected extra column rejected'); rollback to savepoint m049_h;
savepoint m049_i; alter table public.tracekit_investigations drop constraint tracekit_investigations_branch_context_check; select ok(cardinality(pg_temp.m049_verify())>0,'missing constraint rejected'); rollback to savepoint m049_i;
savepoint m049_j; alter table public.tracekit_investigations add constraint m049_unexpected_check check (true); select ok(cardinality(pg_temp.m049_verify())>0,'unexpected constraint rejected'); rollback to savepoint m049_j;
savepoint m049_k; grant execute on function public.tracekit_investigation_branch_guard() to service_role; select ok(cardinality(pg_temp.m049_verify())>0,'service_role branch EXECUTE rejected'); rollback to savepoint m049_k;
savepoint m049_l; grant execute on function public.tracekit_investigation_branch_guard() to public; select ok(cardinality(pg_temp.m049_verify())>0,'PUBLIC branch EXECUTE rejected'); rollback to savepoint m049_l;
savepoint m049_m; alter function public.tracekit_investigation_branch_guard() security definer; select ok(cardinality(pg_temp.m049_verify())>0,'SECURITY drift rejected'); rollback to savepoint m049_m;
savepoint m049_n; alter function public.tracekit_investigation_branch_guard() set search_path = public; select ok(cardinality(pg_temp.m049_verify())>0,'search_path drift rejected'); rollback to savepoint m049_n;
savepoint m049_o; alter table public.tracekit_investigations disable row level security; select ok(cardinality(pg_temp.m049_verify())>0,'RLS drift rejected'); rollback to savepoint m049_o;
savepoint m049_p; grant select on public.tracekit_investigations to public; select ok(cardinality(pg_temp.m049_verify())>0,'PUBLIC table privilege rejected'); rollback to savepoint m049_p;
savepoint m049_q; set local session_replication_role='replica'; insert into public.tracekit_investigations(id,account_id,organization_id,title,question,status,trigger_type,analysis_version) values ('04900000-0000-0000-0000-000000000001','04900000-0000-0000-0000-000000000002','04900000-0000-0000-0000-000000000003','x','x','draft','chargeback_anomaly','x'); select ok(cardinality(pg_temp.m049_verify())>0,'unauthorized row mutation rejected'); rollback to savepoint m049_q;
savepoint m049_r; grant execute on function public.tracekit_investigation_branch_guard() to anon; select ok(cardinality(pg_temp.m049_verify())>0,'anon branch EXECUTE rejected'); rollback to savepoint m049_r;
savepoint m049_s; grant execute on function public.tracekit_investigation_branch_guard() to authenticated; select ok(cardinality(pg_temp.m049_verify())>0,'authenticated branch EXECUTE rejected'); rollback to savepoint m049_s;
savepoint m049_t; create role m049_temp_owner; grant m049_temp_owner to postgres; grant usage,create on schema public to m049_temp_owner; alter table public.tracekit_investigations owner to m049_temp_owner; select ok(cardinality(pg_temp.m049_verify())>0,'table owner drift rejected'); rollback to savepoint m049_t;
savepoint m049_u; create policy m049_unexpected_policy on public.tracekit_investigations for select using (true); select ok(cardinality(pg_temp.m049_verify())>0,'unexpected policy rejected'); rollback to savepoint m049_u;
savepoint m049_v; drop trigger tracekit_investigation_branch_immutable on public.tracekit_investigations; alter table public.tracekit_investigations alter column branch_signal type varchar; select ok(cardinality(pg_temp.m049_verify())>0,'wrong branch-column type rejected'); rollback to savepoint m049_v;
savepoint m049_w; alter table public.tracekit_investigations alter column branch_reason set default 'unexpected'; select ok(cardinality(pg_temp.m049_verify())>0,'unexpected branch-column default rejected'); rollback to savepoint m049_w;
savepoint m049_x; create or replace function public.tracekit_investigation_branch_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$ begin return new; end $$; select ok(cardinality(pg_temp.m049_verify())>0,'branch function body drift rejected'); rollback to savepoint m049_x;
savepoint m049_x2; create role m049_temp_fn_owner; grant m049_temp_fn_owner to postgres; grant usage,create on schema public to m049_temp_fn_owner; alter function public.tracekit_investigation_branch_guard() owner to m049_temp_fn_owner; select ok(cardinality(pg_temp.m049_verify())>0,'function owner drift rejected'); rollback to savepoint m049_x2;
savepoint m049_y; drop trigger tracekit_investigation_branch_cycle_guard on public.tracekit_investigations; create trigger tracekit_investigation_branch_cycle_guard after insert on public.tracekit_investigations for each row execute function public.tracekit_investigation_branch_guard(); select ok(cardinality(pg_temp.m049_verify())>0,'trigger timing/event drift rejected'); rollback to savepoint m049_y;
savepoint m049_z; alter table public.tracekit_investigations disable trigger tracekit_investigation_branch_cycle_guard; select ok(cardinality(pg_temp.m049_verify())>0,'disabled trigger rejected'); rollback to savepoint m049_z;
savepoint m049_aa; drop trigger tracekit_investigation_branch_cycle_guard on public.tracekit_investigations; select ok(cardinality(pg_temp.m049_verify())>0,'missing trigger rejected'); rollback to savepoint m049_aa;
savepoint m049_ab; drop trigger tracekit_investigation_branch_cycle_guard on public.tracekit_investigations; create trigger tracekit_investigation_branch_cycle_guard before insert or update of parent_investigation_id,organization_id on public.tracekit_investigations for each row execute function public.tracekit_investigation_branch_immutable_guard(); select ok(cardinality(pg_temp.m049_verify())>0,'wrong trigger target rejected'); rollback to savepoint m049_ab;
savepoint m049_ac; alter table public.tracekit_investigations enable row level security; alter table public.tracekit_investigations force row level security; select ok(cardinality(pg_temp.m049_verify())>0,'forced RLS drift rejected'); rollback to savepoint m049_ac;
savepoint m049_ad; grant select on public.tracekit_investigations to authenticated; select ok(cardinality(pg_temp.m049_verify())>0,'authenticated table privilege rejected'); rollback to savepoint m049_ad;

select * from finish(); rollback;
