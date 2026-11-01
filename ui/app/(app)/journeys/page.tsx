import { Suspense } from "react";
import { CustomerWorkspace } from "@/components/customers/customer-workspace";

/** Customer Journeys uses the existing authenticated Customer Explorer.
 * Uses the existing governed Customer Explorer read path. */
export default function JourneysPage() {
  return (
    <div className="space-y-4">
      <header className="px-6 pt-6">
        <h1 className="text-lg font-semibold">Customer Journeys</h1>
        <p className="text-sm text-slate-500">Select a customer to inspect verified journeys, orders, acquisition evidence and unresolved attribution.</p>
      </header>
      <Suspense fallback={<div className="p-6 text-sm">Loading Customer Explorer…</div>}>
        <CustomerWorkspace />
      </Suspense>
    </div>
  );
}
