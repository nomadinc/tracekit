import { notFound } from "next/navigation";
import { ConnectionDetail, ConnectionScheduleSummary } from "@/components/connections/integration-experience";
import { loadConnectionExperience } from "@/lib/commerce/integration-experience-server";
export default async function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) { try { const connection = await loadConnectionExperience((await params).connectionId); return <><ConnectionDetail connection={connection} /><ConnectionScheduleSummary connection={connection} /></>; } catch { notFound(); } }
