import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { setMetaAccountSelection } from "@/lib/integrations/meta-connection";
export const dynamic = "force-dynamic";
function sameOrigin(request: Request) { return request.headers.get("origin") === new URL(request.url).origin; }
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!sameOrigin(request)) return NextResponse.json({ok:false,code:"invalid_origin"},{status:403,headers});
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) return NextResponse.json({ok:false,code:"resource_unavailable"},{status:404,headers});
    const body = await request.json().catch(()=>null);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!body || typeof body.connectionId !== "string" || !uuid.test(body.connectionId) || !Array.isArray(body.accountIds) || body.accountIds.length > 1000 || body.accountIds.some((id:unknown)=>typeof id!=="string" || !uuid.test(id)) || new Set(body.accountIds).size!==body.accountIds.length) return NextResponse.json({ok:false,code:"invalid_request"},{status:400,headers});
    const result = await setMetaAccountSelection({session:resolution.session,connectionId:body.connectionId,accountIds:body.accountIds});
    return NextResponse.json({ok:true,selectedAccountCount:result.filter(account=>account.selectedForSync).length,schedulesActivated: false},{headers});
  } catch { return NextResponse.json({ok:false,code:"meta_accounts_unavailable"},{status:503,headers}); }
}
