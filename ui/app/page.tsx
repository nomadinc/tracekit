import { Suspense } from "react";
import AppShell from "@/components/layout/app-shell";
import HomeCommandCenter, { HomeLoading } from "@/components/home/home-command-center";

export default function Home() {
  return (
    <AppShell>
      <Suspense fallback={<HomeLoading />}>
        <HomeCommandCenter />
      </Suspense>
    </AppShell>
  );
}
