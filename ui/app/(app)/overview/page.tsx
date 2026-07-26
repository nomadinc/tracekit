import { Suspense } from "react";
import HomeCommandCenter, { HomeLoading } from "@/components/home/home-command-center";

export default function OverviewPage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeCommandCenter />
    </Suspense>
  );
}
