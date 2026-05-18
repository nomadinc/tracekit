// ui/app/(app)/dashboard/dashboard-client.tsx
"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const KpisPanel = dynamic(() => import("./kpis-panel").then((m) => m.KpisPanel), {
  ssr: false,
});

const RevenueSpendChart = dynamic(
  () => import("./revenue-spend-chart").then((m) => m.RevenueSpendChart),
  { ssr: false }
);

type DateRange = {
  from: Date | null;
  to: Date | null;
};

export default function DashboardClient() {
  const [range, setRange] = React.useState<DateRange>({ from: null, to: null });

  return (
    <div className="space-y-6">
      <KpisPanel
        from={range.from}
        to={range.to}
        onChange={(next: DateRange) => setRange(next)}
      />
      <RevenueSpendChart from={range.from} to={range.to} />
    </div>
  );
}

