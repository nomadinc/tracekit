// ui/app/(app)/dashboard/dashboard-client.tsx
"use client";

import dynamic from "next/dynamic";

const KpisPanel = dynamic(() => import("./kpis-panel").then((m) => m.KpisPanel), {
  ssr: false,
});

const RevenueSpendChart = dynamic(
  () => import("./revenue-spend-chart").then((m) => m.RevenueSpendChart),
  { ssr: false }
);

export default function DashboardClient() {
  return (
    <div className="space-y-6">
      <KpisPanel />
      <RevenueSpendChart />
    </div>
  );
}