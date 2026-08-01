import type { Metadata } from "next";
import MissionControlConcept from "@/components/concepts/mission-control/mission-control-concept";

export const metadata: Metadata = {
  title: "Mission Control Concept · TraceKit",
  description: "An isolated, mock-only concept for TraceKit's home experience.",
};

export default function MissionControlConceptPage() {
  return <MissionControlConcept />;
}
