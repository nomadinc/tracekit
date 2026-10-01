-- WS-016 M5: stamp legacy platform_orders with canonical tenancy only on exact active provider-account binding.
create or replace function public.platform_orders_apply_provider_account_binding()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $$
declare v_binding record;
begin
  if new.account_id is not null or new.organization_id is not null or new.connection_id is not null or new.provider_account_id is not null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.platform,'')),'') is null then return new; end if;
  if nullif(btrim(coalesce(new.platform_store_id,'')),'') is not null then
    select * into v_binding from public.resolve_commerce_provider_account_binding(lower(btrim(new.platform)),btrim(new.platform_store_id));
  else
    select b.account_id,b.organization_id,b.connection_id,b.provider_account_id into v_binding
    from public.commerce_provider_account_bindings b
    join public.commerce_provider_connections pc on pc.id=b.connection_id and pc.status='connected'
    join public.commerce_provider_accounts pa on pa.id=b.provider_account_id and pa.status='active'
    where b.provider=lower(btrim(new.platform)) and b.external_account_id='default' and b.state='active'
      and (select count(*) from public.commerce_provider_account_bindings x where x.provider=b.provider and x.state='active')=1;
  end if;
  if found then
    new.account_id:=v_binding.account_id;
    new.organization_id:=v_binding.organization_id;
    new.connection_id:=v_binding.connection_id;
    new.provider_account_id:=v_binding.provider_account_id;
  end if;
  return new;
end $$;

drop trigger if exists platform_orders_apply_provider_account_binding on public.platform_orders;
create trigger platform_orders_apply_provider_account_binding
before insert or update on public.platform_orders
for each row execute function public.platform_orders_apply_provider_account_binding();
