// ui/app/(app)/orders/page.tsx
import { Suspense } from "react";
import OrdersClient from "./orders-client";

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading orders...</div>}>
      <OrdersClient />
    </Suspense>
  );
}