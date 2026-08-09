import { notFound } from "next/navigation";
import { ConnectionDetail } from "@/components/connections/integration-experience";
import { loadConnectionExperience } from "@/lib/commerce/integration-experience-server";
export default async function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) { try { return <ConnectionDetail connection={await loadConnectionExperience((await params).connectionId)} />; } catch { notFound(); } }
