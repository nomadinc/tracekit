import { Suspense } from "react";
import OperationsClient from "./operations-client";

export default function OperationsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />}>
      <OperationsClient />
    </Suspense>
  );
}
