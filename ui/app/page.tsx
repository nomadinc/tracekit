import { AuthenticatedAppShell } from "@/components/identity/authenticated-app-shell";
import { MissionControl } from "@/components/mission-control/mission-control";
import { missionControlRepository } from "@/lib/mission-control/mock-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await missionControlRepository.getMissionControl();
  return (
    <AuthenticatedAppShell>
      <MissionControl snapshot={snapshot} />
    </AuthenticatedAppShell>
  );
}
