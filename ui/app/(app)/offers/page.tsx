import { Suspense } from "react";
import { OfferWorkspace } from "@/components/offers/offer-workspace";
import { CommerceProductMappingReview } from "@/components/offers/commerce-product-mapping-review";

export default function OffersPage() {
  return (
    <div className="space-y-10">
      <Suspense
        fallback={
          <div className="rounded-2xl border border-white/10 bg-white/[.035] p-8 text-sm text-slate-500">
            Loading authorized Offers…
          </div>
        }
      >
        <OfferWorkspace />
      </Suspense>
      <section className="border-t border-white/10 pt-8">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Operations setup</p>
          <h2 className="mt-1 text-lg font-semibold">Commerce product mapping</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Administrative mapping tools connect provider products to canonical Offer structure. They support data quality and reconciliation; they are not Offer performance reporting.
          </p>
        </div>
        <CommerceProductMappingReview />
      </section>
    </div>
  );
}
