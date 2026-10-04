import {NextResponse} from "next/server";
import {resolveApplicationSession} from "@/lib/identity/application-session";
import {getEdgeTenantBinding,upsertEdgeTenantBinding} from "@/lib/edge/tenant-binding-repository";
import {edgeTenantRefForOrganization} from "@/lib/edge/tenant-identity";

const tenantPattern=/^tenant_[A-Za-z0-9_-]{8,128}$/;
function unavailable(){return NextResponse.json({error:"The requested resource is unavailable."},{status:404});}
async function authorized(){const r=await resolveApplicationSession();if(r.kind!=="authenticated"||!r.session.effectivePermissions.includes("admin.manage_tenants"))return null;return r.session;}

export async function GET(request:Request){
 const session=await authorized();if(!session)return unavailable();
 const tenantRef=new URL(request.url).searchParams.get("tenantRef")||"";if(!tenantPattern.test(tenantRef))return unavailable();
 const binding=await getEdgeTenantBinding(tenantRef);if(!binding)return unavailable();
 return NextResponse.json({binding});
}

export async function POST(request:Request){
 const session=await authorized();if(!session)return unavailable();
 const body=await request.json().catch(()=>null) as {organizationId?:unknown;status?:unknown}|null;
 if(typeof body?.organizationId!=="string"||!["active","disabled"].includes(String(body.status)))return unavailable();
 const allowed=await new (await import("@/lib/identity/supabase-identity-repository")).SupabaseIdentityTenancyRepository().allActiveOrganizations();
 if(!allowed.some(org=>org.id===body.organizationId))return unavailable();
 const tenantRef=edgeTenantRefForOrganization(body.organizationId);
 const binding=await upsertEdgeTenantBinding({tenantRef,organizationId:body.organizationId,status:body.status as "active"|"disabled"});
 return NextResponse.json({binding});
}
