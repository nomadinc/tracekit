begin;
create or replace function public.set_commas_provider_observation_tkid_v1(p_observation_id uuid,p_tkid text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_tkid is null or btrim(p_tkid)='' or length(p_tkid)>512 then raise exception 'invalid tkid'; end if;
 update public.commerce_provider_attribution_observations set tkid=btrim(p_tkid),updated_at=now()
 where id=p_observation_id and provider='commas' and (tkid is null or tkid=btrim(p_tkid));
 return found;
end $$;
revoke all on function public.set_commas_provider_observation_tkid_v1(uuid,text) from public,anon,authenticated,authenticator;
grant execute on function public.set_commas_provider_observation_tkid_v1(uuid,text) to service_role;
comment on function public.set_commas_provider_observation_tkid_v1(uuid,text) is 'Sets only provider-observed Commas TKID evidence; refuses overwrite with a conflicting value.';
commit;