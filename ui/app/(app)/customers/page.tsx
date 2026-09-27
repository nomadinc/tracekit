import { Suspense } from "react";
import { CustomerWorkspace } from "@/components/customers/customer-workspace";

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-8 text-sm text-slate-500">
          Loading Customer Explorer…
        </div>
      }
    >
      <CustomerWorkspace />
    </Suspense>
  );
}
