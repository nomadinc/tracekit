import { NextRequest,NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { completeGoogleAdsOAuth,GoogleAdsConnectionError } from "@/lib/integrations/google-ads-connection";
export const dynamic="force-dynamic";
const COOKIE="tracekit_google_ads_oauth_state";
function back(request:Request,params:Record<string,string>){const u=new URL("/connections",request.url);u.searchParams.set("provider","google_ads");for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);return u;}
export async function GET(request:NextRequest){
 const clear=(res:NextResponse)=>{res.cookies.set(COOKIE,"",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:0,path:"/v1/integrations/google-ads/oauth"});res.headers.set("cache-control","no-store");return res;};
 try{
  const r=await resolveApplicationSession();if(r.kind!=="authenticated")return clear(NextResponse.redirect(back(request,{google:"unavailable"}),303));
  const state=request.nextUrl.searchParams.get("state")||"",code=request.nextUrl.searchParams.get("code")||"",error=request.nextUrl.searchParams.get("error"),cookie=request.cookies.get(COOKIE)?.value||"";
  if(error)return clear(NextResponse.redirect(back(request,{google:"cancelled"}),303));
  if(!state||!code||!cookie||state!==cookie)throw new GoogleAdsConnectionError("google_ads_oauth_state_invalid","Google Ads authorization could not be verified.",403);
  const connected=await completeGoogleAdsOAuth({session:r.session,state,code});
  return clear(NextResponse.redirect(back(request,{google:"connected",connectionId:connected.connectionId,accounts:String(connected.discoveredAccountCount)}),303));
 }catch(e){const x=e instanceof GoogleAdsConnectionError?e:null;const result=x?.code==="google_ads_required_permission_missing"?"permission":x?.code==="google_ads_oauth_state_invalid"?"state":x?.code?.startsWith("google_ads_api_")?x.code:"failed";return clear(NextResponse.redirect(back(request,{google:result}),303));}
}