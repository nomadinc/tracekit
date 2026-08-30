import { Suspense } from "react";
import { OfferWorkspace } from "@/components/offers/offer-workspace";
import { CommerceProductMappingReview } from "@/components/offers/commerce-product-mapping-review";

export default function OffersPage() {
  return <div className="space-y-8"><Suspense fallback={<div className="rounded-xl border bg-white p-8 text-sm text-slate-500">Loading Offer Workspace…</div>}><OfferWorkspace /></Suspense><CommerceProductMappingReview /></div>;
}
