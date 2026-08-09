-- Deterministic historical dispute reconciliation. Email opens a scoped
-- candidate set but is never sufficient to attach a dispute to an Order.

create index if not exists person_source_identities_commerce_email_candidate_idx
  on public.person_source_identities(organization_id,connection_id,source_type,normalized_value,person_id);
create index if not exists platform_orders_commerce_dispute_candidate_idx
  on public.platform_orders(organization_id,connection_id,person_id,order_ts,gross_amount);

create or replace function public.reconcile_commerce_historical_disputes_v1(
  p_organization_id uuid,
  p_connection_id uuid
) returns table(high_confidence bigint,medium_confidence bigint,needs_review bigint,unmatched bigint)
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  insert into public.commerce_dispute_reconciliations(
    id,organization_id,connection_id,dispute_id,algorithm_version,confidence_band,
    numeric_score,candidate_count,matched_canonical_order_id,evidence_factors,reconciled_at
  )
  select gen_random_uuid(),d.organization_id,d.connection_id,d.id,'historical-v1',
    case
      when c.candidate_count=1 and c.exact_date and c.exact_amount and c.exact_product then 'high_confidence'
      when c.candidate_count=1 and c.date_distance<=3 and c.exact_amount and c.exact_product then 'medium_confidence'
      when c.candidate_count>0 then 'needs_review'
      else 'unmatched'
    end,
    case
      when c.candidate_count=1 and c.exact_date and c.exact_amount and c.exact_product then 100
      when c.candidate_count=1 and c.date_distance<=3 and c.exact_amount and c.exact_product then 80
      when c.candidate_count>0 then 40
      else 0
    end,
    c.candidate_count,
    case when c.candidate_count=1 and c.exact_amount and c.exact_product and c.date_distance<=3 then c.order_id end,
    jsonb_build_object('contact_signal_exact',c.email_exact,'date_exact',c.exact_date,'date_distance_days',c.date_distance,'amount_exact',c.exact_amount,'product_exact',c.exact_product,'payment_compatible',c.payment_compatible),
    now()
  from public.commerce_historical_disputes d
  cross join lateral (
    select count(*)::integer candidate_count,
      min(o.canonical_order_id::text)::uuid order_id,
      count(*)>0 email_exact,
      coalesce(bool_and(o.order_ts::date=d.transaction_date),false) exact_date,
      coalesce(min(abs(o.order_ts::date-d.transaction_date)),999999) date_distance,
      coalesce(bool_and(o.gross_amount=d.amount),false) exact_amount,
      coalesce(bool_and(lower(trim(p.title))=lower(trim(d.product_evidence))),false) exact_product,
      coalesce(bool_and(d.payment_method is null or o.payment_type is null or lower(trim(o.payment_type))=lower(trim(d.payment_method))),false) payment_compatible
    from public.person_source_identities e
    join public.platform_orders o on o.organization_id=e.organization_id and o.connection_id=e.connection_id and o.person_id=e.person_id
    left join public.commerce_provider_products p on p.organization_id=o.organization_id and p.id=o.provider_product_id
    where e.organization_id=d.organization_id and e.connection_id=d.connection_id
      and e.source_type='email' and e.normalized_value=d.customer_email_normalized
      and abs(o.order_ts::date-d.transaction_date)<=3
      and o.gross_amount=d.amount
  ) c
  where d.organization_id=p_organization_id and d.connection_id=p_connection_id
  on conflict(dispute_id,algorithm_version) do update set
    confidence_band=excluded.confidence_band,numeric_score=excluded.numeric_score,
    candidate_count=excluded.candidate_count,matched_canonical_order_id=excluded.matched_canonical_order_id,
    evidence_factors=excluded.evidence_factors,reconciled_at=excluded.reconciled_at;

  update public.commerce_historical_disputes d set matching_state=r.confidence_band,updated_at=now()
  from public.commerce_dispute_reconciliations r
  where r.dispute_id=d.id and r.algorithm_version='historical-v1'
    and d.organization_id=p_organization_id and d.connection_id=p_connection_id;

  return query select
    count(*) filter(where r.confidence_band='high_confidence'),
    count(*) filter(where r.confidence_band='medium_confidence'),
    count(*) filter(where r.confidence_band='needs_review'),
    count(*) filter(where r.confidence_band='unmatched')
  from public.commerce_dispute_reconciliations r
  where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.algorithm_version='historical-v1';
end; $$;

revoke all on function public.reconcile_commerce_historical_disputes_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_commerce_historical_disputes_v1(uuid,uuid) to service_role;

create or replace view public.commerce_chargeback_product_intelligence_v1 as
select d.organization_id,d.connection_id,coalesce(nullif(d.product_evidence,''),'Unknown') product,
  count(*) historical_disputes,coalesce(sum(d.amount),0) disputed_amount,coalesce(sum(d.dispute_fee),0) dispute_fees,
  count(*) filter(where r.confidence_band in ('high_confidence','medium_confidence')) defensible_matches,
  count(*) filter(where r.confidence_band='high_confidence') high_confidence,
  count(*) filter(where r.confidence_band='medium_confidence') medium_confidence,
  count(*) filter(where r.confidence_band='needs_review') needs_review,
  count(*) filter(where r.confidence_band='unmatched') unmatched,
  avg(d.dispute_date-d.transaction_date) filter(where d.dispute_date is not null and d.transaction_date is not null) average_days_to_dispute,
  percentile_cont(0.5) within group(order by d.dispute_date-d.transaction_date) filter(where d.dispute_date is not null and d.transaction_date is not null) median_days_to_dispute
from public.commerce_historical_disputes d
left join public.commerce_dispute_reconciliations r on r.dispute_id=d.id and r.algorithm_version='historical-v1'
group by d.organization_id,d.connection_id,coalesce(nullif(d.product_evidence,''),'Unknown');
revoke all on public.commerce_chargeback_product_intelligence_v1 from anon,authenticated;
grant select on public.commerce_chargeback_product_intelligence_v1 to service_role;
