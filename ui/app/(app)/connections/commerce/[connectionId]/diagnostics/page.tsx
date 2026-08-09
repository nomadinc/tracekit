import { notFound } from "next/navigation";
import { ConnectionDetail } from "@/components/connections/integration-experience";
import { loadConnectionExperience } from "@/lib/commerce/integration-experience-server";
export default async function ConnectionDiagnosticsPage({ params }: { params: Promise<{ connectionId: string }> }) { try { return <ConnectionDetail connection={await loadConnectionExperience((await params).connectionId)} view="diagnostics" />; } catch { notFound(); } }
