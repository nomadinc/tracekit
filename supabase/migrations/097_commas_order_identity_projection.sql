begin;

create or replace function public.project_platform_order_customer_identity_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if new.platform = 'commas' and new.person_id is not null and new.organization_id is not null then
    select nullif(lower(btrim(p.primary_email)), '')
      into v_email
    from public.people p
    where p.id = new.person_id
      and p.organization_id = new.organization_id
    limit 1;

    if v_email is not null then
      new.email := coalesce(nullif(btrim(new.email), ''), v_email);
      new.customer_email := coalesce(nullif(btrim(new.customer_email), ''), v_email);
      new.customer_email_normalized := coalesce(nullif(lower(btrim(new.customer_email_normalized)), ''), v_email);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_platform_order_customer_identity_v1 on public.platform_orders;
create trigger trg_project_platform_order_customer_identity_v1
before insert or update of person_id, organization_id on public.platform_orders
for each row
execute function public.project_platform_order_customer_identity_v1();

update public.platform_orders po
set
  email = coalesce(nullif(btrim(po.email), ''), lower(btrim(p.primary_email))),
  customer_email = coalesce(nullif(btrim(po.customer_email), ''), lower(btrim(p.primary_email))),
  customer_email_normalized = coalesce(nullif(lower(btrim(po.customer_email_normalized)), ''), lower(btrim(p.primary_email))),
  updated_at = now()
from public.people p
where po.platform = 'commas'
  and po.person_id = p.id
  and po.organization_id = p.organization_id
  and nullif(btrim(p.primary_email), '') is not null
  and (
    nullif(btrim(po.email), '') is null
    or nullif(btrim(po.customer_email), '') is null
    or nullif(btrim(po.customer_email_normalized), '') is null
  );

commit;
