import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { getMetaConnectionPresentation } from "@/lib/integrations/meta-connection";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) return NextResponse.json({ok:false,code:"resource_unavailable"},{status:404,headers});
    const rows = await getMetaConnectionPresentation(resolution.session);
    const connections = rows.map(row => ({connectionId:row.connectionId,displayName:row.displayName,status:row.status,reauthorizationRequired:row.reauthorizationRequired,selectedAccountCount:row.selectedAccountCount,accounts:row.accounts.map(account=>({id:account.id,externalId:account.externalId,label:account.label,currency:account.currency,timezoneName:account.timezoneName,status:account.status,selectedForSync:account.selectedForSync}))}));
    return NextResponse.json({ok:true,connections,syncEnabled:false},{headers});
  } catch { return NextResponse.json({ok:false,code:"meta_status_unavailable"},{status:503,headers}); }
}
