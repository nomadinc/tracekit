alter table public.everflow_order_reconciliations
  drop constraint if exists everflow_order_reconciliations_confidence_band_check;

alter table public.everflow_order_reconciliations
  add constraint everflow_order_reconciliations_confidence_band_check
  check (
    confidence_band = any (
      array[
        'high_confidence'::text,
        'medium_confidence'::text,
        'needs_review'::text,
        'unmatched'::text,
        'duplicate'::text
      ]
    )
  );
