begin;
select plan(8);

select ok(exists(select 1 from storage.buckets where id = 'commerce-evidence'), 'Commerce Evidence bucket exists');
select is((select public from storage.buckets where id = 'commerce-evidence'), false, 'Commerce Evidence bucket is private');
select is((select file_size_limit from storage.buckets where id = 'commerce-evidence'), 10485760::bigint, 'Evidence object size is bounded');
select is((select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%commerce-evidence%' or with_check like '%commerce-evidence%')), 0, 'No browser Storage policy exposes Commerce Evidence');

set local role anon;
select is((select count(*)::integer from storage.objects where bucket_id = 'commerce-evidence'), 0, 'anon cannot enumerate Commerce Evidence');
reset role;

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id = 'commerce-evidence'), 0, 'authenticated cannot enumerate Commerce Evidence');
reset role;

select is((select count(*)::integer from public.commerce_evidence_records where metadata ? 'migration_seed'), 0, 'Migration seeds no Evidence metadata');
select is((select count(*)::integer from public.commerce_repository_activation), 0, 'Migration creates no repository activation');

select * from finish();
rollback;
