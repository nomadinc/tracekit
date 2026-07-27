// ui/app/(app)/dashboard/dashboard-client.tsx
"use client";

import dynamic from "next/dynamic";

const DecisionHomeOverview = dynamic(
  () =>
    import("./decision-home-overview").then(
      (module) => module.DecisionHomeOverview,
    ),
  { ssr: false },
);

export default function DashboardClient() {
  return <DecisionHomeOverview />;
}
