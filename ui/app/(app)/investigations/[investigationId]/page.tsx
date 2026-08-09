import { notFound } from "next/navigation";
import { InvestigationAccessRequired, InvestigationDetail } from "@/components/investigations/investigation-experience";
import { loadInvestigation } from "@/lib/investigations/server-repository";
import { AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
export default async function InvestigationPage({params}:{params:Promise<{investigationId:string}>}) { try{const {investigationId}=await params;const investigation=await loadInvestigation(investigationId);if(!investigation)notFound();return <InvestigationDetail investigation={investigation}/>;}catch(error){if(error instanceof AuthorizationDeniedError)return <InvestigationAccessRequired/>;throw error;} }
