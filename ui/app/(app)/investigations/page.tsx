import { InvestigationAccessRequired, InvestigationIndex } from "@/components/investigations/investigation-experience";
import { loadInvestigationCandidates, loadInvestigations } from "@/lib/investigations/server-repository";
import { AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
export default async function InvestigationsPage() { try{const [investigations,candidates]=await Promise.all([loadInvestigations(),loadInvestigationCandidates()]);return <InvestigationIndex investigations={investigations} candidates={candidates}/>;}catch(error){if(error instanceof AuthorizationDeniedError)return <InvestigationAccessRequired/>;throw error;} }
