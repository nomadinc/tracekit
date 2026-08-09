import { InvestigationAccessRequired, InvestigationIndex } from "@/components/investigations/investigation-experience";
import { loadInvestigations } from "@/lib/investigations/server-repository";
import { AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
export default async function InvestigationsPage() { try{return <InvestigationIndex investigations={await loadInvestigations()}/>;}catch(error){if(error instanceof AuthorizationDeniedError)return <InvestigationAccessRequired/>;throw error;} }
