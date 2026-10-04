import{NextResponse}from"next/server";
import{resolveApplicationSession}from"@/lib/identity/application-session";
import{AuthorizationDeniedError,requirePermission}from"@/lib/identity/authorization-gateway";

function sameOrigin(request:Request){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");return(!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin");}
function response(body:Record<string,unknown>,status:number){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export async function POST(request:Request){
  try{
    if(!sameOrigin(request))return response({ok:false,code:"request_verification_failed"},403);
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return response({ok:false,code:"resource_unavailable"},404);
    requirePermission(resolution.session,"actions.execute");
    // Production V1 exposes this operation only through the governed, server-targeted
    // intent -> confirmation -> atomic authorization -> execution boundary.
    return response({ok:false,code:"governed_action_required"},404);
  }catch(error){
    if(error instanceof AuthorizationDeniedError)return response({ok:false,code:"resource_unavailable"},404);
    return response({ok:false,code:"resource_unavailable"},404);
  }
}
