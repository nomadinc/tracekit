import AppShell from "@/components/layout/app-shell";
import { MissionControl } from "@/components/mission-control/mission-control";
import { missionControlRepository } from "@/lib/mission-control/mock-repository";

export default async function Home() {
  const snapshot = await missionControlRepository.getMissionControl();
  return (
    <AppShell>
      <MissionControl snapshot={snapshot} />
    </AppShell>
  );
}
