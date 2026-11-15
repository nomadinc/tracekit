import { Suspense } from "react";
import { OfferWorkspace } from "@/components/offers/offer-workspace";
import { CommerceProductMappingSection } from "@/components/offers/commerce-product-mapping-review";

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
      <CommerceProductMappingSection />
    </div>
  );
}
