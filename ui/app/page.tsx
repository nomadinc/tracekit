import { redirect } from "next/navigation";
import { AuthenticatedAppShell } from "@/components/identity/authenticated-app-shell";
import { MissionControl } from "@/components/mission-control/mission-control";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { resolveDefaultLanding } from "@/lib/identity/default-landing";
import { missionControlRepository } from "@/lib/mission-control/mock-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const resolution = await resolveApplicationSession();

  if (resolution.kind === "authenticated") {
    const landing = resolveDefaultLanding(resolution.session);
    if (landing !== "/") redirect(landing);
  }

  const snapshot = await missionControlRepository.getMissionControl();
  return (
    <AuthenticatedAppShell>
      <MissionControl snapshot={snapshot} />
    </AuthenticatedAppShell>
  );
}
