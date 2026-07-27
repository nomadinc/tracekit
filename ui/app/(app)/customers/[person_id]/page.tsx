import { Suspense } from "react";
import CustomerDetailClient from "./customer-detail-client";

export default async function CustomerDetailPage({ params }: { params: Promise<{ person_id: string }> }) {
  const resolved = await params;
  return (
    <Suspense fallback={<div className="rounded-lg border bg-white p-5 text-sm text-slate-500 dark:bg-ink/80">Loading customer...</div>}>
      <CustomerDetailClient personId={decodeURIComponent(resolved.person_id)} />
    </Suspense>
  );
}
