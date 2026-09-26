create or replace function public.tracekit_shopify_order_attribution_from_journey()
returns trigger
language plpgsql
as $$
declare
  last_utm jsonb;
  first_utm jsonb;
begin
  if new.platform <> 'shopify' then
    return new;
  end if;

  last_utm := coalesce(new.raw_json #> '{customerJourneySummary,lastVisit,utmParameters}', '{}'::jsonb);
  first_utm := coalesce(new.raw_json #> '{customerJourneySummary,firstVisit,utmParameters}', '{}'::jsonb);

  new.everflow_transaction_id := coalesce(
    nullif(btrim(last_utm->>'term'), ''),
    nullif(btrim(first_utm->>'term'), ''),
    new.everflow_transaction_id
  );
  new.affiliate_id := coalesce(
    nullif(btrim(last_utm->>'source'), ''),
    nullif(btrim(first_utm->>'source'), ''),
    new.affiliate_id
  );
  new.everflow_offer_id := coalesce(
    nullif(btrim(last_utm->>'campaign'), ''),
    nullif(btrim(first_utm->>'campaign'), ''),
    new.everflow_offer_id
  );

  return new;
end;
$$;

drop trigger if exists tracekit_shopify_order_attribution_from_journey on public.platform_orders;
create trigger tracekit_shopify_order_attribution_from_journey
before insert or update of raw_json on public.platform_orders
for each row
execute function public.tracekit_shopify_order_attribution_from_journey();

update public.platform_orders
set
  everflow_transaction_id = coalesce(
    nullif(btrim(raw_json #>> '{customerJourneySummary,lastVisit,utmParameters,term}'), ''),
    nullif(btrim(raw_json #>> '{customerJourneySummary,firstVisit,utmParameters,term}'), ''),
    everflow_transaction_id
  ),
  affiliate_id = coalesce(
    nullif(btrim(raw_json #>> '{customerJourneySummary,lastVisit,utmParameters,source}'), ''),
    nullif(btrim(raw_json #>> '{customerJourneySummary,firstVisit,utmParameters,source}'), ''),
    affiliate_id
  ),
  everflow_offer_id = coalesce(
    nullif(btrim(raw_json #>> '{customerJourneySummary,lastVisit,utmParameters,campaign}'), ''),
    nullif(btrim(raw_json #>> '{customerJourneySummary,firstVisit,utmParameters,campaign}'), ''),
    everflow_offer_id
  )
where platform = 'shopify'
  and raw_json ? 'customerJourneySummary';
