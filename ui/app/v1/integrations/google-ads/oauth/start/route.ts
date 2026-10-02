import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { GoogleAdsConnectionError, startGoogleAdsOAuth } from "@/lib/integrations/google-ads-connection";
export const dynamic="force-dynamic";
const COOKIE="tracekit_google_ads_oauth_state";
export async function GET(){
 try{
  const r=await resolveApplicationSession();
  if(r.kind!=="authenticated")return NextResponse.json({ok:false,code:"resource_unavailable",message:"The requested resource is unavailable."},{status:404});
  const started=startGoogleAdsOAuth(r.session),res=NextResponse.redirect(started.url,303);
  res.cookies.set(COOKIE,started.state,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:10*60,path:"/v1/integrations/google-ads/oauth"});
  res.headers.set("cache-control","no-store");return res;
 }catch(e){const x=e instanceof GoogleAdsConnectionError?e:null;return NextResponse.json({ok:false,code:x?.code||"google_ads_connection_failed",message:x?.message||"Google Ads connection could not be started."},{status:x?.httpStatus||500});}
}