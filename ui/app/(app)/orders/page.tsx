// ui/app/(app)/orders/page.tsx
import { Suspense } from "react";
import { OrderWorkspace } from "@/components/orders/order-workspace";

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading orders...</div>}>
      <OrderWorkspace />
    </Suspense>
  );
}
