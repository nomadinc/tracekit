import { AuthenticatedMissionControl } from "@/components/mission-control/authenticated-mission-control";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <AuthenticatedMissionControl />;
}
