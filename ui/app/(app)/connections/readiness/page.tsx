import { ReadinessOverview } from "@/components/connections/integration-experience";
import { loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";
export default async function ReadinessPage() { return <ReadinessOverview connections={await loadConnectionExperiences()} />; }
