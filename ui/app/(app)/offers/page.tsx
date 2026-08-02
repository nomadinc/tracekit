import { Suspense } from "react";
import { OfferWorkspace } from "@/components/offers/offer-workspace";

export default function OffersPage() {
  return <Suspense fallback={<div className="rounded-xl border bg-white p-8 text-sm text-slate-500">Loading Offer Workspace…</div>}><OfferWorkspace /></Suspense>;
}
