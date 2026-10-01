import { NextResponse } from "next/server";
import { runDueCommasSchedules } from "@/lib/commerce/commas-scheduled-worker";

export const dynamic="force-dynamic";
export const maxDuration=300;

function authorized(request:Request){const secret=String(process.env.CRON_SECRET||"").trim();return Boolean(secret)&&request.headers.get("authorization")===`Bearer ${secret}`;}

export async function GET(request:Request){
  if(!authorized(request))return NextResponse.json({ok:false,message:"Unauthorized."},{status:401});
  try{
    const scheduler=await runDueCommasSchedules({limit:1});
    console.info("commas_scheduler_tick",{dueTargets:scheduler.dueTargets,attempted:scheduler.attempted,completed:scheduler.completed,failed:scheduler.failed});
    return NextResponse.json({ok:true,scheduler});
  }catch(error){
    const message=error instanceof Error?error.message.slice(0,300):"unknown_error";
    console.error("commas_scheduler_failed",{message});
    return NextResponse.json({ok:false,message:"TraceKit could not complete Commas scheduled work."},{status:500});
  }
}
