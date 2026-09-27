import { Suspense } from "react";
import { OrderWorkspace } from "@/components/orders/order-workspace";

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-8 text-sm text-slate-500">
          Loading Order Explorer…
        </div>
      }
    >
      <OrderWorkspace />
    </Suspense>
  );
}
