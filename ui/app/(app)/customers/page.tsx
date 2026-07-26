import { Suspense } from "react";
import CustomersClient from "./customers-client";

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-white p-5 text-sm text-slate-500 dark:bg-ink/80">Loading customers...</div>}>
      <CustomersClient />
    </Suspense>
  );
}
